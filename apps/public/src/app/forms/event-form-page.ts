import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import {
  EventFormRendererComponent,
  parseFormAnswersJson,
  parseFormElementsJson,
  serializeFormAnswers,
} from '@cacic-fct/shared-angular';
import {
  type EventFormTargetType,
  type PublicEventForm,
  type PublicEventFormResponse,
  type PublicEventFormResults,
} from '@cacic-fct/event-manager-public-contracts';
import { type FormResponseAnswer } from '@cacic-fct/form-contracts';
import { Observable, Subscription, catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';
import { arePublicFormResultsReleased, isPublicFormLinkAvailable } from './event-form-availability';
import { PublicEventFormApiService } from './event-form-api.service';

type FormResultSummary = {
  questions: Array<{
    elementId: string;
    title: string;
    type: string;
    answeredCount: number;
    buckets: Array<{ label: string; value: number }>;
    textAnswers: string[];
  }>;
};

type FormPageState =
  | { status: 'loading' }
  | {
      status: 'ready';
      form: PublicEventForm;
      response: PublicEventFormResponse | null;
      linkId: string | null;
      targetType: EventFormTargetType;
      targetId: string;
      canAnswer: boolean;
      resultsReleased: boolean;
      elements: ReturnType<typeof parseFormElementsJson>;
      answers: FormResponseAnswer[];
    }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-event-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatToolbarModule,
    EventFormRendererComponent,
  ],
  templateUrl: './event-form-page.html',
  styleUrl: './event-form-page.css',
})
export class EventFormPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(PublicEventFormApiService);
  private readonly snackbar = inject(MatSnackBar);
  private resultsRequestId = 0;

  readonly state = toSignal(
    combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(
      switchMap(([params, query]) => this.loadState(params, query)),
      startWith({ status: 'loading' } satisfies FormPageState),
    ),
    { initialValue: { status: 'loading' } satisfies FormPageState },
  );
  readonly results = signal<PublicEventFormResults | null>(null);
  readonly resultsLoading = signal(false);
  readonly resultsSummary = computed(() => this.parseSummary(this.results()?.summaryJson));

  private readonly resultsWatcher = effect((onCleanup) => {
    const currentState = this.state();
    this.results.set(null);
    this.resultsLoading.set(false);
    if (currentState.status !== 'ready' || !currentState.resultsReleased) {
      return;
    }

    const subscriptions = new Subscription();
    this.loadResults(currentState, subscriptions);

    if (currentState.form.resultsLive && typeof EventSource !== 'undefined') {
      subscriptions.add(
        this.api.watchCurrentUserResults(this.resultsInput(currentState)).subscribe({
          next: () => this.loadResults(currentState, subscriptions),
          error: () => {
            this.snackbar.open('Atualizações ao vivo indisponíveis no momento.', 'Fechar', { duration: 4000 });
          },
        }),
      );
    }

    onCleanup(() => subscriptions.unsubscribe());
  });

  async submit(state: Extract<FormPageState, { status: 'ready' }>, answers: FormResponseAnswer[]): Promise<void> {
    this.api
      .submit(
        state.targetType === 'EVENT'
          ? {
              formId: state.form.id,
              linkId: state.linkId,
              targetType: state.targetType,
              eventId: state.targetId,
              majorEventId: null,
              answersJson: serializeFormAnswers(answers),
            }
          : {
              formId: state.form.id,
              linkId: state.linkId,
              targetType: state.targetType,
              eventId: null,
              majorEventId: state.targetId,
              answersJson: serializeFormAnswers(answers),
            },
      )
      .subscribe({
        next: () => {
          this.snackbar.open('Respostas salvas.', 'Fechar', { duration: 3000 });
          void this.router.navigate(['/profile', 'attendances']);
        },
        error: (error: unknown) => {
          this.snackbar.open(error instanceof Error ? error.message : 'Não foi possível salvar as respostas.', 'Fechar', {
            duration: 6000,
          });
        },
      });
  }

  private loadState(params: ParamMap, query: ParamMap): Observable<FormPageState> {
    const formId = params.get('formId')?.trim();
    const targetType = this.parseTargetType(query.get('targetType'));
    const targetId = query.get('targetId')?.trim();
    const requestedLinkId = query.get('linkId')?.trim() || null;

    if (!formId || !targetType || !targetId) {
      return of({ status: 'error', message: 'Link de formulário inválido.' } satisfies FormPageState);
    }

    const target = this.targetInput(targetType, targetId);
    return this.api.listCurrentUserForms({ targetType, ...target }).pipe(
      switchMap((forms) => {
        const form = forms.find((item) => item.id === formId);
        if (!form) {
          return of({ status: 'error', message: 'Formulário não encontrado para esta inscrição.' } satisfies FormPageState);
        }
        const link = this.findLink(form, targetType, targetId, requestedLinkId);
        if (!link) {
          return of({ status: 'error', message: 'Vínculo de formulário inválido.' } satisfies FormPageState);
        }
        const canAnswer = isPublicFormLinkAvailable(link);
        const resultsReleased = arePublicFormResultsReleased(form, link);
        if (!canAnswer && !resultsReleased) {
          return of({
            status: 'error',
            message: 'Este formulário não está disponível no momento.',
          } satisfies FormPageState);
        }
        if (!canAnswer) {
          return of({
            status: 'ready',
            form,
            response: null,
            linkId: link.id,
            targetType,
            targetId,
            canAnswer,
            resultsReleased,
            elements: parseFormElementsJson(form.elementsJson),
            answers: [],
          } satisfies FormPageState);
        }
        return this.api.getCurrentUserResponse({ formId, linkId: link.id, targetType, ...target }).pipe(
          map(
            (response) =>
              ({
                status: 'ready',
                form,
                response,
                linkId: link.id,
                targetType,
                targetId,
                canAnswer,
                resultsReleased,
                elements: parseFormElementsJson(form.elementsJson),
                answers: parseFormAnswersJson(response?.answersJson),
              }) satisfies FormPageState,
          ),
        );
      }),
      startWith({ status: 'loading' } satisfies FormPageState),
      catchError((error: unknown) =>
        of({
          status: 'error',
          message: error instanceof Error ? error.message : 'Não foi possível carregar o formulário.',
        } satisfies FormPageState),
      ),
    );
  }

  private findLink(
    form: PublicEventForm,
    targetType: EventFormTargetType,
    targetId: string,
    requestedLinkId: string | null,
  ) {
    return (
      form.links.find(
        (link) =>
          (!requestedLinkId || link.id === requestedLinkId) &&
          link.targetType === targetType &&
          (link.eventId ?? null) === (targetType === 'EVENT' ? targetId : null) &&
          (link.majorEventId ?? null) === (targetType === 'MAJOR_EVENT' ? targetId : null),
      ) ?? null
    );
  }

  private parseTargetType(value: string | null): EventFormTargetType | null {
    return value === 'EVENT' || value === 'MAJOR_EVENT' ? value : null;
  }

  private targetInput(targetType: EventFormTargetType, targetId: string): { eventId?: string; majorEventId?: string } {
    return targetType === 'EVENT' ? { eventId: targetId } : { majorEventId: targetId };
  }

  private resultsInput(state: Extract<FormPageState, { status: 'ready' }>) {
    return {
      formId: state.form.id,
      targetType: state.targetType,
      ...this.targetInput(state.targetType, state.targetId),
    };
  }

  private loadResults(state: Extract<FormPageState, { status: 'ready' }>, subscriptions: Subscription): void {
    const requestId = ++this.resultsRequestId;
    this.resultsLoading.set(true);
    subscriptions.add(
      this.api.getCurrentUserResults(this.resultsInput(state)).subscribe({
        next: (results) => {
          if (requestId !== this.resultsRequestId) {
            return;
          }
          this.results.set(results);
          this.resultsLoading.set(false);
        },
        error: () => {
          if (requestId !== this.resultsRequestId) {
            return;
          }
          this.results.set(null);
          this.resultsLoading.set(false);
        },
      }),
    );
  }

  resultVisibilityLabel(state: Extract<FormPageState, { status: 'ready' }>): string {
    return state.canAnswer && state.form.resultsLive
      ? 'Resultados ao vivo'
      : 'Resultados liberados após o encerramento';
  }

  sigiloLabel(result: PublicEventFormResults): string {
    if (result.anonymous) {
      return 'respostas anônimas';
    }
    if (!result.answersReleased) {
      return 'respostas individuais ocultas';
    }
    return 'respostas individuais visíveis';
  }

  private parseSummary(value: string | null | undefined): FormResultSummary {
    if (!value) {
      return { questions: [] };
    }

    try {
      const parsed = JSON.parse(value) as FormResultSummary;
      return Array.isArray(parsed.questions) ? parsed : { questions: [] };
    } catch {
      return { questions: [] };
    }
  }
}
