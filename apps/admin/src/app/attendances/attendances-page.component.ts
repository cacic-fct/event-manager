import { Component, OnDestroy, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { EventContextPickerComponent, type EventContextRef } from '../shared/event-context-picker.component';
import { MatIconModule } from '@angular/material/icon';
import { AttendancesService } from './attendances.service';
import { EventAttendancesComponent } from './event-attendances.component';
import { MajorEventAttendancesComponent } from './major-event-attendances.component';
import { ADMIN_SHELL_CONTEXT } from '../shared/admin-shell-context';
import { AdminRouteResourceErrorService } from '../shared/admin-route-resource-error.service';

@Component({
  selector: 'app-workspace-attendances-tab',
  imports: [EventContextPickerComponent, MatButtonModule, MatProgressBarModule, MatIconModule, EventAttendancesComponent, MajorEventAttendancesComponent],
  templateUrl: './attendances-page.component.html',
  styleUrls: [
    '../app-shell/layout/page-layout.shared.scss',
    '../app-shell/layout/lists-layout.shared.scss',
    '../app-shell/layout/entity-permissions.shared.scss',
    '../app-shell/layout/forms-feedback.shared.scss',
    '../app-shell/layout/workspace-tabs.shared.scss',
    './attendances-page.component.scss',
  ],
})
export class AttendancesPageComponent implements OnDestroy {
  protected readonly inWorkspaceShell = inject(ADMIN_SHELL_CONTEXT, { optional: true }) ?? false;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly workspace = inject(AttendancesService);
  private readonly routeResourceErrors = inject(AdminRouteResourceErrorService);

  readonly context = signal<EventContextRef | null>(null);
  readonly contextLoading = signal(false);
  readonly contextError = signal('');

  private contextRequest = 0;
  private contextLoad = Promise.resolve();

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const request = ++this.contextRequest;
      const eventId = params.get('eventId');
      const majorEventId = params.get('majorEventId');
      const context: EventContextRef | null = eventId ? { kind: 'event', id: eventId }
        : majorEventId ? { kind: 'major-event', id: majorEventId } : null;
      this.context.set(context);
      this.contextError.set('');
      this.contextLoading.set(Boolean(context));
      this.contextLoad = this.contextLoad.catch(() => undefined).then(async () => {
        if (request !== this.contextRequest) return;
        this.workspace.closeAttendanceLiveStream();
        if (!context) return;
        try {
          if (context.kind === 'event') await this.workspace.selectAttendanceEventById(context.id);
          else {
            await this.workspace.selectMajorEventAttendancesById(context.id, false);
            if (request !== this.contextRequest) return;
            const personId = params.get('personId');
            if (personId) await this.workspace.selectMajorEventUserAttendanceById(context.id, personId);
          }
        } catch (error) {
          if (request === this.contextRequest && !this.routeResourceErrors.redirectIfUnavailable(error)) {
            if (error instanceof Error && error.message === 'Participante não encontrado neste grande evento.') {
              this.routeResourceErrors.redirectNotFound();
            } else {
              this.contextError.set('Não foi possível abrir as presenças deste contexto. Escolha outro ou tente novamente.');
            }
          }
        } finally {
          if (request === this.contextRequest) this.contextLoading.set(false);
        }
      });
    });
  }

  selectContext(context: EventContextRef): void {
    void this.router.navigate(['/attendances', context.kind, context.id]);
  }

  ngOnDestroy(): void {
    this.contextRequest++;
    this.workspace.closeAttendanceLiveStream();
  }
}
