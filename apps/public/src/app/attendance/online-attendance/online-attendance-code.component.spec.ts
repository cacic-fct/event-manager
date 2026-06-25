import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Params, Router, convertToParamMap } from '@angular/router';
import { ScannerFeedbackService } from '@cacic-fct/shared-angular';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BehaviorSubject, of } from 'rxjs';
import { EmojiService } from '../../shared/emoji.service';
import { OnlineAttendanceApiService, PendingOnlineAttendanceEvent } from './online-attendance-api.service';
import { OnlineAttendanceCodeComponent } from './online-attendance-code.component';

describe('OnlineAttendanceCodeComponent', () => {
  it('normalizes manual codes into the signal form model', async () => {
    const { component } = await createFixture();
    const input = document.createElement('input');
    input.value = 'a!b2c3';
    const event = new Event('input');
    Object.defineProperty(event, 'target', { value: input });

    (component as unknown as { normalizeCodeInput(event: Event): void }).normalizeCodeInput(event);

    expect(input.value).toBe('AB2C');
    expect(component.codeModel().code).toBe('AB2C');
    expect(component.slots()).toBe('AB2C');
  });

  it('submits the normalized code for the selected pending event', async () => {
    const { api, component } = await createFixture({ routeParams: { eventId: 'event-1' } });

    component.codeForm.code().value.set('A1B2');
    component.submit();

    expect(api.confirmAttendance).toHaveBeenCalledWith('event-1', 'A1B2');
  });
});

async function createFixture({
  routeParams = { eventId: 'event-1' },
  queryParams = {},
}: {
  routeParams?: Params;
  queryParams?: Params;
} = {}): Promise<{
  api: {
    confirmAttendance: ReturnType<typeof vi.fn>;
    listPendingEvents: ReturnType<typeof vi.fn>;
  };
  component: OnlineAttendanceCodeComponent;
  fixture: ComponentFixture<OnlineAttendanceCodeComponent>;
}> {
  const paramMap = new BehaviorSubject(convertToParamMap(routeParams));
  const queryParamMap = new BehaviorSubject(convertToParamMap(queryParams));
  const api = {
    confirmAttendance: vi.fn(() => of({ eventId: 'event-1', attendedAt: null, createdAt: null })),
    listPendingEvents: vi.fn(() => of([pendingAttendanceEvent])),
  };

  await TestBed.configureTestingModule({
    imports: [OnlineAttendanceCodeComponent],
    providers: [
      provideNoopAnimations(),
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap,
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
        provide: MatDialog,
        useValue: {
          open: vi.fn(),
        },
      },
      {
        provide: MatSnackBar,
        useValue: {
          open: vi.fn(),
        },
      },
      {
        provide: OnlineAttendanceApiService,
        useValue: api,
      },
      {
        provide: Router,
        useValue: {
          navigate: vi.fn(),
          navigateByUrl: vi.fn(),
        },
      },
      {
        provide: ScannerFeedbackService,
        useValue: {
          show: vi.fn(),
        },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(OnlineAttendanceCodeComponent);
  await fixture.whenStable();

  return {
    api,
    component: fixture.componentInstance,
    fixture,
  };
}

const pendingAttendanceEvent = {
  eventId: 'event-1',
  event: {
    id: 'event-1',
    name: 'Evento teste',
    startDate: '2026-06-25T12:00:00.000Z',
    endDate: '2026-06-25T13:00:00.000Z',
    type: 'OTHER',
    emoji: '🎓',
    majorEvent: null,
  },
} satisfies PendingOnlineAttendanceEvent;
