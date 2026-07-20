import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { OfflineEventAttendanceSubmission } from '@cacic-fct/event-manager-admin-contracts';
import { OfflineAttendanceSubmissionDialogComponent } from './offline-attendance-submission-dialog.component';

describe('OfflineAttendanceSubmissionDialogComponent', () => {
  it('shows review context with explicit action labels when the submission can be approved', async () => {
    const { fixture } = await createFixture();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.textContent).toContain('Revisar presença off-line');
    expect(element.textContent).toContain('Pronta para aprovação');
    expect(element.textContent).toContain('Código do crachá');
    expect(button(element, 'Aprovar presença')?.disabled).toBe(false);
    expect(button(element, 'Rejeitar')).not.toBeNull();
    expect(button(element, 'Corrigir dados')).not.toBeNull();
  });

  it('explains why approval is blocked when the submission still has a resolution error', async () => {
    const { fixture } = await createFixture({
      submission: {
        ...submissionFixture,
        resolutionError: 'Não foi possível localizar uma pessoa única para o dado coletado.',
        resolutionIssue: 'DUPLICATE_PERSON',
      },
    });
    const element: HTMLElement = fixture.nativeElement;

    expect(element.textContent).toContain('Precisa de correção');
    expect(element.textContent).toContain('Corrija os dados da pessoa antes de aprovar esta presença off-line.');
    expect(element.textContent).toContain('Erro de identificação');
    expect(button(element, 'Aprovar presença')?.disabled).toBe(true);
  });

  it('removes review actions in read-only mode', async () => {
    const { fixture } = await createFixture({ canReview: false });
    const element: HTMLElement = fixture.nativeElement;

    expect(element.textContent).toContain('Somente leitura');
    expect(button(element, 'Aprovar presença')).toBeNull();
    expect(button(element, 'Rejeitar')).toBeNull();
  });
});

async function createFixture({
  submission = submissionFixture,
  canReview = true,
}: {
  submission?: OfflineEventAttendanceSubmission & { eventName: string; personName: string };
  canReview?: boolean;
} = {}): Promise<{
  fixture: ComponentFixture<OfflineAttendanceSubmissionDialogComponent>;
}> {
  await TestBed.configureTestingModule({
    imports: [OfflineAttendanceSubmissionDialogComponent],
    providers: [
      provideNoopAnimations(),
      {
        provide: MAT_DIALOG_DATA,
        useValue: {
          submission,
          canReview,
        },
      },
      {
        provide: MatDialogRef,
        useValue: {
          close: vi.fn(),
        },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(OfflineAttendanceSubmissionDialogComponent);
  fixture.detectChanges();

  return { fixture };
}

function button(element: HTMLElement, label: string): HTMLButtonElement | null {
  return Array.from(element.querySelectorAll('button')).find((item) => item.textContent?.includes(label)) ?? null;
}

const submissionFixture: OfflineEventAttendanceSubmission & { eventName: string; personName: string } = {
  id: 'offline-attendance-1',
  clientId: 'offline-client-1',
  eventId: 'event-1',
  eventName: 'Credenciamento',
  personId: 'person-1',
  personName: 'Ada Lovelace',
  status: 'PENDING',
  createdByMethod: 'SCANNER',
  scannerCode: 'user:person-1',
  manualValue: null,
  collectedAt: '2026-05-21T17:20:00.000Z',
  authorUserId: 'collector-user',
  authorName: 'Coletora Offline',
  authorEmail: 'coletora@example.edu',
  submittedById: 'admin-1',
  submittedByFullName: 'Admin Teste',
  submittedAt: '2026-05-21T18:00:00.000Z',
  stagedReason: 'Coleta sincronizada após a janela de autorização.',
  resolutionError: null,
  resolutionIssue: 'COLLECTION_WINDOW_EXPIRED',
  collectedLatitude: null,
  collectedLongitude: null,
  collectedAccuracyMeters: null,
  committedAt: null,
  committedById: null,
  committedByFullName: null,
  rejectedAt: null,
  rejectedById: null,
  rejectedByFullName: null,
  rejectionReason: null,
};
