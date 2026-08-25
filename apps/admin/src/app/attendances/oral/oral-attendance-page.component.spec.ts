import { HttpErrorResponse } from '@angular/common/http';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '@cacic-fct/shared-angular';
import { of, throwError } from 'rxjs';
import { AttendanceApiService } from '../../graphql/attendance-api.service';
import { EventApiService } from '../../graphql/event-api.service';
import { AttendancesService } from '../attendances.service';
import { AdminFeedbackService } from '../../feedback/admin-feedback.service';
import { isRetryableSyncError } from './oral-attendance-page.component';
import { AdminOralAttendancePageComponent } from './oral-attendance-page.component';

describe('isRetryableSyncError', () => {
  it.each([0, 408, 429, 500, 503])('retries transient HTTP status %s', (status) => {
    expect(isRetryableSyncError(new HttpErrorResponse({ status }))).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])('does not retry permanent HTTP status %s', (status) => {
    expect(isRetryableSyncError(new HttpErrorResponse({ status }))).toBe(false);
  });

  it('does not retry GraphQL validation errors represented as regular errors', () => {
    expect(isRetryableSyncError(new Error('Entrada inválida.'))).toBe(false);
  });
});

describe('AdminOralAttendancePageComponent lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(globalThis, 'localStorage');
    TestBed.resetTestingModule();
  });

  it('clears the delayed sync timer when destroyed', () => {
    vi.useFakeTimers();
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    const setEventOralAttendances = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 })));
    TestBed.configureTestingModule({
      providers: [
        AdminOralAttendancePageComponent,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'event-1' } } } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: AuthService, useValue: { user: () => ({ sub: 'admin-1', preferredUsername: 'Admin' }) } },
        {
          provide: AttendanceApiService,
          useValue: {
            listEventAttendanceOralRoster: vi.fn(() => of([])),
            setEventOralAttendances,
            createAdminOfflineAttendanceCollectorCredential: vi.fn(() => of('credential')),
          },
        },
        { provide: EventApiService, useValue: { getEvent: vi.fn(() => of({ name: 'Evento' })) } },
        { provide: AttendancesService, useValue: { invalidateExplicitAbsences: vi.fn() } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: AdminFeedbackService, useValue: { error: vi.fn() } },
      ],
    });
    const component = TestBed.inject(AdminOralAttendancePageComponent);
    component.ngOnInit();
    (
      component as unknown as { registerDecision: (person: { personId: string }, decision: 'PRESENT') => void }
    ).registerDecision({ personId: 'person-1' }, 'PRESENT');

    vi.advanceTimersByTime(300);
    expect(setEventOralAttendances).toHaveBeenCalledTimes(1);
    component.ngOnDestroy();
    vi.advanceTimersByTime(10_000);

    expect(setEventOralAttendances).toHaveBeenCalledTimes(1);
  });
});
