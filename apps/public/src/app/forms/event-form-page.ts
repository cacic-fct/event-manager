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
      targetType: EventFormTargetType;
      targetId: string;
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

  elements(form: PublicEventForm) {
    return parseFormElementsJson(form.elementsJson);
  }

  answers(response: PublicEventFormResponse | null) {
    return parseFormAnswersJson(response?.answersJson);
  }

  async submit(state: Extract<FormPageState, { status: 'ready' }>, answers: FormResponseAnswer[]): Promise<void> {
    const target = this.targetInput(state.targetType, state.targetId);
    this.api
      .submit({
        formId: state.form.id,
        linkId:
          state.form.links.find(
            (link) =>
              link.targetType === state.targetType &&
              (link.eventId ?? null) === (state.targetType === 'EVENT' ? state.targetId : null) &&
              (link.majorEventId ?? null) === (state.targetType === 'MAJOR_EVENT' ? state.targetId : null),
          )?.id ?? null,
        targetType: state.targetType,
        eventId: target.eventId,
        majorEventId: target.majorEventId,
        answersJson: serializeFormAnswers(answers),
        source: 'PUBLIC_FORM',
      })
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
        return this.api.getCurrentUserResponse({ formId, targetType, ...target }).pipe(
          map(
            (response) =>
              ({
                status: 'ready',
                form,
                response,
                targetType,
                targetId,
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

  private parseTargetType(value: string | null): EventFormTargetType | null {
    return value === 'EVENT' || value === 'MAJOR_EVENT' ? value : null;
  }

  private targetInput(targetType: EventFormTargetType, targetId: string): { eventId?: string; majorEventId?: string } {
    return targetType === 'EVENT' ? { eventId: targetId } : { majorEventId: targetId };
  }
}
