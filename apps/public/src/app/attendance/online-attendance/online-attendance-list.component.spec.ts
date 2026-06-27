import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { createPublicEvent } from '../../testing/public-entity-fixtures';
import { EmojiService } from '../../shared/emoji.service';
import { OnlineAttendanceApiService, PendingOnlineAttendanceEvent } from './online-attendance-api.service';
import { OnlineAttendanceListComponent } from './online-attendance-list.component';
import { BehaviorSubject, throwError, of } from 'rxjs';

describe('OnlineAttendanceListComponent', () => {
  it('renders pending attendance events with major-event context', async () => {
    const { fixture } = await createFixture({
      pendingEvents: [pendingAttendanceEvent()],
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Presenças pendentes');
    expect(fixture.nativeElement.textContent).toContain('Presença on-line');
    expect(fixture.nativeElement.textContent).toContain('SECOMPP Pago');
  });

  it('renders the empty pending attendance state', async () => {
    const { fixture } = await createFixture({ pendingEvents: [] });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Nenhuma presença pendente.');
  });

  it('renders API errors without throwing during component creation', async () => {
    const { fixture } = await createFixture({
      error: new Error('Falha de rede'),
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Falha de rede');
  });

  it('returns to the provided URL when the toolbar back action is used', async () => {
    const { component, router } = await createFixture({
      queryParams: { returnUrl: '/profile/attendances' },
      pendingEvents: [],
    });
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    component.back();

    expect(navigateByUrl).toHaveBeenCalledWith('/profile/attendances');
  });
});

async function createFixture({
  error,
  pendingEvents = [pendingAttendanceEvent()],
  queryParams = {},
}: {
  error?: Error;
  pendingEvents?: PendingOnlineAttendanceEvent[];
  queryParams?: Record<string, string>;
} = {}): Promise<{
  component: OnlineAttendanceListComponent;
  fixture: ComponentFixture<OnlineAttendanceListComponent>;
  router: Router;
}> {
  const queryParamMap = new BehaviorSubject(convertToParamMap(queryParams));
  const api = {
    listPendingEvents: vi.fn(() => (error ? throwError(() => error) : of(pendingEvents))),
  };

  await TestBed.configureTestingModule({
    imports: [OnlineAttendanceListComponent],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap,
        },
      },
      {
        provide: EmojiService,
        useValue: {
          getTwemojiUrl: vi.fn(() => ''),
        },
      },
      {
        provide: OnlineAttendanceApiService,
        useValue: api,
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(OnlineAttendanceListComponent);
  fixture.detectChanges();

  return {
    component: fixture.componentInstance,
    fixture,
    router: TestBed.inject(Router),
  };
}

function pendingAttendanceEvent(): PendingOnlineAttendanceEvent {
  return {
    eventId: 'online-event',
    event: createPublicEvent({
      id: 'online-event',
      name: 'Presença on-line',
      emoji: 'check_circle',
      startDate: '2027-08-01T14:00:00.000Z',
      endDate: '2027-08-01T16:00:00.000Z',
      majorEvent: {
        id: 'paid-major',
        name: 'SECOMPP Pago',
      } as never,
    }),
  };
}
