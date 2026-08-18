import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AttendanceOfflineQueueService } from '@cacic-fct/public-indexed-db';
import { AuthService } from '@cacic-fct/shared-angular';
import { AttendanceCollectionApiService, AttendanceCollectionEvent } from '../attendance-collection-api.service';

@Component({
  selector: 'app-attendance-method',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatIconModule, MatToolbarModule],
  template: `
    <mat-toolbar>
      <a matIconButton routerLink="/attendance/collect" aria-label="Voltar para eventos">
        <mat-icon>arrow_back</mat-icon>
      </a>
      <h1 class="global-toolbar-title">{{ event()?.event?.name || 'Coletar presença' }}</h1>
    </mat-toolbar>
    <main class="method-page">
      @if (event(); as selected) {
        <header>
          <span>{{ selected.event.emoji }}</span>
        </header>
        <section aria-labelledby="method-title">
          <h2 id="method-title">Como você quer coletar?</h2>
          <a mat-stroked-button [routerLink]="['/attendance/collect', selected.eventId, 'scanner']">
            <mat-icon>qr_code_scanner</mat-icon>
            Escanear códigos
          </a>
          @if (selected.event.shouldAllowOralAttendance) {
            <a mat-flat-button [routerLink]="['/attendance/collect', selected.eventId, 'oral']">
              <mat-icon>record_voice_over</mat-icon>
              Fazer chamada oral
            </a>
          }
        </section>
      }
    </main>
  `,
  styles: `
    .method-page {
      max-width: 42rem;
      margin: 0 auto;
      padding: clamp(1rem, 4vw, 3rem);
    }
    header {
      display: flex;
      gap: 1rem;
      align-items: center;
      margin-bottom: 3rem;
    }
    header > span {
      font-size: 3rem;
    }
    section {
      display: grid;
      gap: 1rem;
    }
    section a {
      min-height: 4.5rem;
      justify-content: flex-start;
      font-size: 1rem;
    }
  `,
})
export class AttendanceMethodPage implements OnInit {
  private readonly api = inject(AttendanceCollectionApiService);
  private readonly auth = inject(AuthService);
  private readonly offline = inject(AttendanceOfflineQueueService);
  private readonly route = inject(ActivatedRoute);
  protected readonly event = signal<AttendanceCollectionEvent | null>(null);

  ngOnInit(): void {
    const eventId = this.route.snapshot.paramMap.get('eventId');
    if (!eventId) {
      return;
    }
    this.api.listCollectionEvents().subscribe({
      next: (events) => this.event.set(events.find((event) => event.eventId === eventId) ?? null),
      error: async () => {
        const userId = this.auth.user()?.sub;
        this.event.set(userId ? await this.offline.getCollectionEvent(userId, eventId) : null);
      },
    });
  }
}
