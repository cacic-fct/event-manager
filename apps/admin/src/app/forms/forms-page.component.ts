import { ADMIN_SHELL_CONTEXT } from '../shared/admin-shell-context';
import { combineLatest, of } from 'rxjs';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { Component, computed, DestroyRef, effect, OnDestroy, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, ParamMap, convertToParamMap } from '@angular/router';
import { Permission } from '@cacic-fct/shared-permissions';
import {
  EventFormBuilderComponent,
  EventFormDescriptionContentComponent,
  EventFormRendererComponent,
} from '@cacic-fct/shared-angular/event-forms';
import {
  EventForm,
  EventFormAudience,
  EventFormResponseMode,
  EventFormSigilo,
} from '@cacic-fct/event-manager-admin-contracts';
import { PermissionsService } from '../permissions/permissions.service';
import { FormsService } from './forms.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { DeleteEventFormDialogComponent } from './dialogs/delete-event-form-dialog.component';
import { FormResultsComponent } from './form-results.component';
import { WorkspaceRecordComponent } from '../shared/workspace-record.component';
import { WorkspaceScopeComponent } from '../shared/workspace-scope.component';
import { EventWorkspaceContextService } from '../event-workspace/event-workspace-context.service';
import { EventTargetPickerComponent } from '../shared/event-target-picker.component';

@Component({
  selector: 'app-workspace-forms-tab',
  imports: [
    TwemojiComponent,
    ReactiveFormsModule,
    DatePipe,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTabsModule,
    MatTooltipModule,
    EventFormBuilderComponent,
    EventFormDescriptionContentComponent,
    EventFormRendererComponent,
    FormResultsComponent,
    WorkspaceRecordComponent,
    WorkspaceScopeComponent,
    EventTargetPickerComponent,
  ],
  templateUrl: './forms-page.component.html',
  styleUrls: [
    '../app-shell/layout/page-layout.shared.scss',
    '../app-shell/layout/lists-layout.shared.scss',
    '../app-shell/layout/entity-permissions.shared.scss',
    '../app-shell/layout/forms-feedback.shared.scss',
    '../app-shell/layout/workspace-tabs.shared.scss',
    './forms-page.component.scss',
  ],
})
export class FormsPageComponent implements OnDestroy {
  protected readonly inWorkspaceShell = inject(ADMIN_SHELL_CONTEXT, { optional: true }) ?? false;
  readonly workspace = inject(FormsService);
  private readonly shellContext = inject(EventWorkspaceContextService, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private routeReverting = false;
  protected readonly scopeEmoji = computed(() => {
    const scope = this.workspace.targetFilter();
    return scope?.eventId ? this.workspace.events().find((event) => event.id === scope.eventId)?.emoji
      : scope?.majorEventId ? this.workspace.majorEvents().find((event) => event.id === scope.majorEventId)?.emoji : null;
  });

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  protected readonly auditLog = inject(AuditLogService);
  protected readonly permissions = inject(PermissionsService);
  protected readonly Permission = Permission;
  protected readonly sigiloOptions: EventFormSigilo[] = ['PUBLIC', 'PARTIALLY_SECRET', 'SECRET', 'ANONYMOUS'];
  protected readonly responseModeOptions: EventFormResponseMode[] = [
    'ONE_PER_TARGET',
    'MULTIPLE_PER_TARGET',
    'SINGLE_PER_FORM',
  ];

  constructor() {
    effect(() => this.shellContext?.scopeSwitchBlocked.set(this.workspace.unsavedChanges()));
    this.destroyRef.onDestroy(() => this.shellContext?.scopeSwitchBlocked.set(false));
    combineLatest([this.route.paramMap, this.route.queryParamMap ?? of(convertToParamMap({}))])
      .pipe(takeUntilDestroyed()).subscribe(([params, query]) => { void this.applyRouteParams(params, query); });
  }

  canDeactivate(nextUrl?: string): boolean | Promise<boolean> {
    if (this.routeReverting) {
      return true;
    }
    if (nextUrl) {
      const next = this.router.parseUrl(nextUrl);
      const segments = next.root.children['primary']?.segments.map((segment) => segment.path) ?? [];
      // Selecting a form hydrates its editor before the bookmark navigation completes.
      // That navigation keeps the same editor and scope, including edits entered meanwhile.
      if (segments.length === 2 && segments[0] === 'forms' && segments[1] === this.workspace.selectedForm()?.id) {
        const scope = this.workspace.targetFilter();
        if ((next.queryParams['eventId'] || undefined) === scope?.eventId &&
          (next.queryParams['majorEventId'] || undefined) === scope?.majorEventId) return true;
      }
    }
    return this.workspace.confirmDiscardChanges();
  }

  ngOnDestroy(): void {
    this.routeRequest++;
    this.workspace.cancelPendingSelection();
    this.workspace.closeResultsStream();
  }

  handleFormImageUpload(input: HTMLInputElement): void {
    void this.workspace.uploadImage(input.files?.[0] ?? null);
    input.value = '';
  }

  sigiloLabel(sigilo: EventFormSigilo): string {
    switch (sigilo) {
      case 'PUBLIC':
        return 'Público';
      case 'PARTIALLY_SECRET':
        return 'Parcialmente sigiloso';
      case 'SECRET':
        return 'Sigiloso';
      case 'ANONYMOUS':
        return 'Anônimo';
    }
  }

  sigiloDescription(sigilo: EventFormSigilo): string {
    switch (sigilo) {
      case 'PUBLIC':
        return 'Administradores, ministrantes e pessoas inscritas ou presentes podem ver quem respondeu e as respostas.';
      case 'PARTIALLY_SECRET':
        return 'Administradores veem tudo; demais pessoas autorizadas veem quem respondeu, sem respostas individuais.';
      case 'SECRET':
        return 'Apenas administradores veem quem respondeu e as respostas individuais.';
      case 'ANONYMOUS':
        return 'Administradores veem quem respondeu, mas não é possível identificar quem enviou cada resposta.';
    }
  }

  sigiloIcon(sigilo: EventFormSigilo): string {
    switch (sigilo) {
      case 'PUBLIC':
        return 'visibility';
      case 'PARTIALLY_SECRET':
        return 'group';
      case 'SECRET':
        return 'lock';
      case 'ANONYMOUS':
        return 'shield_lock';
    }
  }

  responseModeLabel(mode: EventFormResponseMode): string {
    switch (mode) {
      case 'ONE_PER_TARGET':
        return 'Uma resposta por evento';
      case 'MULTIPLE_PER_TARGET':
        return 'Várias respostas por evento';
      case 'SINGLE_PER_FORM':
        return 'Uma resposta para o formulário inteiro';
    }
  }

  responseModeDescription(mode: EventFormResponseMode): string {
    switch (mode) {
      case 'ONE_PER_TARGET':
        return 'A mesma pessoa pode responder uma vez para cada evento ou grande evento vinculado.';
      case 'MULTIPLE_PER_TARGET':
        return 'A mesma pessoa pode enviar novas respostas para o mesmo evento ou grande evento.';
      case 'SINGLE_PER_FORM':
        return 'A primeira resposta vale para todos os eventos e grandes eventos onde este formulário aparecer.';
    }
  }

  audienceLabel(audiences: readonly EventFormAudience[] | null | undefined): string {
    if (!audiences?.length) {
      return 'Nenhum público selecionado';
    }

    return audiences.map((audience) => this.audienceOptionLabel(audience)).join(', ');
  }

  audienceOptionLabel(audience: EventFormAudience): string {
    switch (audience) {
      case 'INTERESTED':
        return 'Interessados ainda não inscritos';
      case 'SUBSCRIBERS':
        return 'Inscritos';
      case 'ATTENDEES':
        return 'Participantes com presença';
    }
  }

  stateLabel(form: EventForm): string {
    switch (form.publicationState) {
      case 'PUBLISHED':
        return 'Publicado';
      case 'SCHEDULED':
        return 'Agendado';
      case 'UNPUBLISHED':
        return 'Fora do ar';
      default:
        return 'Rascunho';
    }
  }

  canEditSelected(): boolean {
    const selected = this.workspace.selectedForm();
    return this.permissions.canEdit(selected ? Permission.EventForm.Update : Permission.EventForm.Create);
  }

  updateLinkOrder(localId: string, event: Event): void {
    const value = event.target instanceof HTMLInputElement ? Number(event.target.value) : 0;
    this.workspace.updateLink(localId, { displayOrder: Number.isFinite(value) ? value : 0 });
  }

  updateLinkDate(localId: string, key: 'availableFrom' | 'availableUntil', event: Event): void {
    const value = event.target instanceof HTMLInputElement ? event.target.value : '';
    this.workspace.updateLinkDate(localId, key, value);
  }

  confirmDelete(): void {
    const selected = this.workspace.selectedForm();
    if (!selected) {
      return;
    }

    if (selected.responseCount === 0) {
      void this.workspace.delete();
      return;
    }

    this.dialog
      .open<DeleteEventFormDialogComponent, { name: string; responseCount: number }, boolean>(
        DeleteEventFormDialogComponent,
        {
          data: {
            name: selected.name,
            responseCount: selected.responseCount,
          },
          width: 'min(420px, 96vw)',
        },
      )
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) {
          void this.workspace.delete();
        }
      });
  }

  private routeRequest = 0;
  private async applyRouteParams(params: ParamMap, query: ParamMap): Promise<void> {
    const request = ++this.routeRequest;
    const eventId = (params.get('eventId') ?? query.get('eventId'))?.trim();
    const majorEventId = (params.get('majorEventId') ?? query.get('majorEventId'))?.trim();
    const formId = params.get('formId')?.trim();
    const accepted = await this.workspace.setTargetFilter(eventId ? { eventId } : majorEventId ? { majorEventId } : null);
    if (!accepted) {
      if (request === this.routeRequest) {
        this.routeReverting = true;
        try {
          await this.router.navigate(this.workspace.currentScopeRoute(), { replaceUrl: true });
        } finally {
          this.routeReverting = false;
        }
      }
      return;
    }
    if (request !== this.routeRequest) return;
    if (!formId) {
      this.workspace.cancelPendingSelection();
      if (this.workspace.selectedForm()) await this.workspace.createForm(false);
      if (request !== this.routeRequest) return;
    }
    await this.workspace.initialize();
    if (request !== this.routeRequest) return;
    if (formId) {
      await this.workspace.selectFormById(formId, { skipIfCurrent: true });
      if (request !== this.routeRequest || eventId || majorEventId || !this.inWorkspaceShell || this.workspace.unsavedChanges()) return;
      const form = this.workspace.selectedForm();
      const scope = form?.ownerEventId ? { eventId: form.ownerEventId }
        : form?.ownerMajorEventId ? { majorEventId: form.ownerMajorEventId } : null;
      if (form?.id === formId && scope) {
        await this.router.navigate([], { relativeTo: this.route, queryParams: scope, queryParamsHandling: 'merge', replaceUrl: true });
      }
    }
  }
}
