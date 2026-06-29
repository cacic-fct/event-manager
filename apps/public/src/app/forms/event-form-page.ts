import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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
} from '@cacic-fct/event-manager-public-contracts';
import { type FormResponseAnswer } from '@cacic-fct/form-contracts';
import { Observable, catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';
import { PublicEventFormApiService } from './event-form-api.service';

type FormPageState =
  | { status: 'loading' }
  | {
      status: 'ready';
      form: PublicEventForm;
      response: PublicEventFormResponse | null;
      linkId: string | null;
      targetType: EventFormTargetType;
      targetId: string;
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

  readonly state = toSignal(
    combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(
      switchMap(([params, query]) => this.loadState(params, query)),
      startWith({ status: 'loading' } satisfies FormPageState),
    ),
    { initialValue: { status: 'loading' } satisfies FormPageState },
  );

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
        return this.api.getCurrentUserResponse({ formId, targetType, ...target }).pipe(
          map(
            (response) =>
              ({
                status: 'ready',
                form,
                response,
                linkId: link.id,
                targetType,
                targetId,
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
}
