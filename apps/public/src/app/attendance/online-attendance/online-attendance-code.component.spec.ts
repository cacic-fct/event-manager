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

  it('submits a compatible Aztec online attendance scan', async () => {
    const { api, component, dialog, scannerFeedback } = await createFixture({
      scannerCode: 'online-attendance:event-1:z9y8',
    });

    component.scanCode();

    expect(dialog.open).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        data: expect.objectContaining({
          acceptedPrefixes: ['online-attendance:event-1:'],
          title: 'Escanear presença on-line',
        }),
      }),
    );
    expect(component.codeModel().code).toBe('Z9Y8');
    expect(api.confirmAttendance).toHaveBeenCalledWith('event-1', 'Z9Y8');
    expect(scannerFeedback.show).toHaveBeenCalledWith('valid');
  });

  it('rejects scanned attendance codes for a different event', async () => {
    const { api, component, fixture, scannerFeedback, snackBar } = await createFixture({
      scannerCode: 'online-attendance:other-event:z9y8',
    });

    component.scanCode();
    await fixture.whenStable();

    expect(api.confirmAttendance).not.toHaveBeenCalled();
    expect(scannerFeedback.show).toHaveBeenCalledWith('invalid');
    expect(snackBar.open).toHaveBeenCalledWith('Código Aztec incompatível com este evento.', 'OK', {
      duration: 5000,
    });
  });

  it('navigates to the next pending attendance after a successful confirmation', async () => {
    const nextPendingEvent = {
      ...pendingAttendanceEvent,
      eventId: 'event-2',
      event: {
        ...pendingAttendanceEvent.event,
        id: 'event-2',
        name: 'Próximo evento',
      },
    };
    const { component, api, router } = await createFixture({
      pendingEventsAfterSubmit: [nextPendingEvent],
    });

    component.codeForm.code().value.set('A1B2');
    component.submit();

    expect(api.confirmAttendance).toHaveBeenCalledWith('event-1', 'A1B2');
    expect(router.navigate).toHaveBeenCalledWith(['/attendance/register', 'event-2'], {
      queryParams: { returnUrl: '/menu' },
    });
  });
});

async function createFixture({
  routeParams = { eventId: 'event-1' },
  queryParams = {},
  pendingEventsAfterSubmit = [],
  scannerCode = null,
}: {
  routeParams?: Params;
  queryParams?: Params;
  pendingEventsAfterSubmit?: PendingOnlineAttendanceEvent[];
  scannerCode?: string | null;
} = {}): Promise<{
  api: {
    confirmAttendance: ReturnType<typeof vi.fn>;
    listPendingEvents: ReturnType<typeof vi.fn>;
  };
  component: OnlineAttendanceCodeComponent;
  dialog: { open: ReturnType<typeof vi.fn> };
  fixture: ComponentFixture<OnlineAttendanceCodeComponent>;
  router: { navigate: ReturnType<typeof vi.fn>; navigateByUrl: ReturnType<typeof vi.fn> };
  scannerFeedback: { show: ReturnType<typeof vi.fn> };
  snackBar: { open: ReturnType<typeof vi.fn> };
}> {
  const paramMap = new BehaviorSubject(convertToParamMap(routeParams));
  const queryParamMap = new BehaviorSubject(convertToParamMap(queryParams));
  const api = {
    confirmAttendance: vi.fn(() => of({ eventId: 'event-1', attendedAt: null, createdAt: null })),
    listPendingEvents: vi.fn(() => of([pendingAttendanceEvent] as PendingOnlineAttendanceEvent[])),
  };
  api.listPendingEvents.mockReturnValueOnce(of([pendingAttendanceEvent]));
  if (pendingEventsAfterSubmit.length > 0) {
    api.listPendingEvents.mockReturnValueOnce(of(pendingEventsAfterSubmit));
  }
  const dialog = {
    open: vi.fn(() => ({
      afterClosed: () => of(scannerCode),
    })),
  };
  const router = {
    navigate: vi.fn(),
    navigateByUrl: vi.fn(),
  };
  const scannerFeedback = {
    show: vi.fn(),
  };
  const snackBar = {
    open: vi.fn(),
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
        useValue: dialog,
      },
      {
        provide: MatSnackBar,
        useValue: snackBar,
      },
      {
        provide: OnlineAttendanceApiService,
        useValue: api,
      },
      {
        provide: Router,
        useValue: router,
      },
      {
        provide: ScannerFeedbackService,
        useValue: scannerFeedback,
      },
    ],
  })
    .overrideProvider(MatSnackBar, { useValue: snackBar })
    .compileComponents();

  const fixture = TestBed.createComponent(OnlineAttendanceCodeComponent);
  fixture.detectChanges();
  await fixture.whenStable();

  return {
    api,
    component: fixture.componentInstance,
    dialog,
    fixture,
    router,
    scannerFeedback,
    snackBar,
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
