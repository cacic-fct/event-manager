import { FormBuilder } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { MergeCandidate, MergeCandidateStatus } from '@cacic-fct/event-manager-admin-contracts';
import { MergeCandidateApiService } from '../graphql/merge-candidate-api.service';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { PeopleService } from '../people/people.service';
import { adminFixtureDate, createAdminPerson } from '../testing/admin-entity-fixtures';
import { MergeCandidatesService } from './merge-candidates.service';

describe('MergeCandidatesService', () => {
  let service: MergeCandidatesService;
  let api: {
    listMergeCandidates: ReturnType<typeof vi.fn>;
    scanMergeCandidates: ReturnType<typeof vi.fn>;
    updateMergeCandidate: ReturnType<typeof vi.fn>;
    deleteMergeCandidate: ReturnType<typeof vi.fn>;
    mergeCandidatePeople: ReturnType<typeof vi.fn>;
    undoMergeCandidatePeople: ReturnType<typeof vi.fn>;
  };
  let dialog: { open: ReturnType<typeof vi.fn> };
  let snackBar: { open: ReturnType<typeof vi.fn> };
  let feedback: { error: ReturnType<typeof vi.fn> };
  let peopleService: { searchPeople: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = {
      listMergeCandidates: vi.fn(() => of([candidateFixture()])),
      scanMergeCandidates: vi.fn(() => of(4)),
      updateMergeCandidate: vi.fn(() => of(candidateFixture({ status: 'REJECTED' }))),
      deleteMergeCandidate: vi.fn(() => of({ deleted: true, id: 'candidate-1' })),
      mergeCandidatePeople: vi.fn(() => of(candidateFixture({ status: 'MERGED' }))),
      undoMergeCandidatePeople: vi.fn(() => of(candidateFixture({ status: 'PENDING' }))),
    };
    dialog = {
      open: vi.fn(() => ({ afterClosed: () => of(null) })),
    };
    snackBar = { open: vi.fn() };
    feedback = { error: vi.fn() };
    peopleService = { searchPeople: vi.fn(() => Promise.resolve()) };

    TestBed.configureTestingModule({
      providers: [
        FormBuilder,
        MergeCandidatesService,
        { provide: MergeCandidateApiService, useValue: api },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: AdminFeedbackService, useValue: feedback },
        { provide: PeopleService, useValue: peopleService },
      ],
    });

    service = TestBed.inject(MergeCandidatesService);
  });

  it('loads filtered candidates with page variables and applies the bounded result', async () => {
    const page = Array.from({ length: 51 }, (_, index) => candidateFixture({ id: `candidate-${index}` }));
    api.listMergeCandidates.mockReturnValueOnce(of(page));

    await service.refreshMergeCandidates();

    expect(api.listMergeCandidates).toHaveBeenCalledWith({ status: 'PENDING', skip: 0, take: 51 });
    expect(service.mergeCandidates()).toHaveLength(50);
    expect(service.mergeCandidates()[0].id).toBe('candidate-0');
    expect(service.mergeCandidatesPagination.hasNextPage()).toBe(true);

    service.mergeFilterForm.controls.status.setValue('REJECTED');
    await service.applyMergeCandidateFilters();

    expect(service.mergeCandidatesPagination.pageIndex()).toBe(0);
    expect(api.listMergeCandidates).toHaveBeenLastCalledWith({ status: 'REJECTED', skip: 0, take: 51 });
  });

  it('navigates only within available pages and refreshes each page', async () => {
    api.listMergeCandidates
      .mockReturnValueOnce(of(Array.from({ length: 51 }, (_, index) => candidateFixture({ id: `first-${index}` }))))
      .mockReturnValueOnce(of([candidateFixture({ id: 'second-page' })]))
      .mockReturnValueOnce(of([candidateFixture({ id: 'back-again' })]));

    await service.refreshMergeCandidates();
    await service.nextMergeCandidatesPage();
    expect(service.mergeCandidatesPagination.pageIndex()).toBe(1);
    expect(api.listMergeCandidates).toHaveBeenNthCalledWith(2, { status: 'PENDING', skip: 50, take: 51 });

    await service.previousMergeCandidatesPage();
    expect(service.mergeCandidatesPagination.pageIndex()).toBe(0);
    expect(api.listMergeCandidates).toHaveBeenNthCalledWith(3, { status: 'PENDING', skip: 0, take: 51 });

    await service.nextMergeCandidatesPage();
    expect(api.listMergeCandidates).toHaveBeenCalledTimes(3);
  });

  it('scans candidates, refreshes, and optionally notifies', async () => {
    await service.scanMergeCandidates();

    expect(api.scanMergeCandidates).toHaveBeenCalledOnce();
    expect(api.listMergeCandidates).toHaveBeenCalledOnce();
    expect(snackBar.open).toHaveBeenCalledWith(
      '4 par(es) de possíveis duplicidades verificados.',
      'Fechar',
      { duration: 2500 },
    );

    snackBar.open.mockClear();
    await service.scanMergeCandidates(false);
    expect(api.scanMergeCandidates).toHaveBeenCalledTimes(2);
    expect(snackBar.open).not.toHaveBeenCalled();
  });

  it('reports scan failures without leaving a rejected promise', async () => {
    const error = new Error('scan unavailable');
    api.scanMergeCandidates.mockReturnValueOnce(throwError(() => error));

    await expect(service.scanMergeCandidates()).resolves.toBeUndefined();

    expect(feedback.error).toHaveBeenCalledWith(error, 'Não foi possível verificar duplicidades.');
    expect(api.listMergeCandidates).not.toHaveBeenCalled();
  });

  it('updates and deletes candidates before refreshing the queue', async () => {
    const candidate = candidateFixture();

    await service.setMergeCandidateStatus(candidate, 'REJECTED');
    expect(api.updateMergeCandidate).toHaveBeenCalledWith('candidate-1', { status: 'REJECTED' });
    expect(api.listMergeCandidates).toHaveBeenCalledOnce();

    await service.deleteMergeCandidate(candidate);
    expect(api.deleteMergeCandidate).toHaveBeenCalledWith('candidate-1');
    expect(api.listMergeCandidates).toHaveBeenCalledTimes(2);
  });

  it('opens the merge plan dialog and cancels without mutating when closed', async () => {
    const candidate = candidateFixture();

    await service.mergeCandidate(candidate);

    expect(dialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        width: '72rem',
        maxWidth: '95vw',
        data: { candidate },
      }),
    );
    expect(api.mergeCandidatePeople).not.toHaveBeenCalled();
    expect(api.listMergeCandidates).not.toHaveBeenCalled();
    expect(peopleService.searchPeople).not.toHaveBeenCalled();
  });

  it('maps an accepted merge plan, notifies, refreshes, and refreshes people search', async () => {
    dialog.open.mockReturnValueOnce({
      afterClosed: () =>
        of({
          targetPersonId: 'person-b',
          migrateFields: ['EMAIL', 'ACADEMIC_ID'],
        }),
    });

    await service.mergeCandidate(candidateFixture());

    expect(api.mergeCandidatePeople).toHaveBeenCalledWith({
      candidateId: 'candidate-1',
      targetPersonId: 'person-b',
      migrateFields: ['EMAIL', 'ACADEMIC_ID'],
    });
    expect(snackBar.open).toHaveBeenCalledWith('Pessoas unificadas com sucesso.', 'Fechar', { duration: 2500 });
    expect(api.listMergeCandidates).toHaveBeenCalledOnce();
    expect(peopleService.searchPeople).toHaveBeenCalledWith('');
  });

  it('reports merge failures and does not refresh dependent lists', async () => {
    const error = new Error('merge rejected');
    dialog.open.mockReturnValueOnce({
      afterClosed: () => of({ targetPersonId: 'person-b', migrateFields: [] }),
    });
    api.mergeCandidatePeople.mockReturnValueOnce(throwError(() => error));

    await expect(service.mergeCandidate(candidateFixture())).resolves.toBeUndefined();

    expect(feedback.error).toHaveBeenCalledWith(error, 'Não foi possível unificar as pessoas.');
    expect(api.listMergeCandidates).not.toHaveBeenCalled();
    expect(peopleService.searchPeople).not.toHaveBeenCalled();
  });

  it('undoes a merge, refreshes both queues, and reports undo failures', async () => {
    await service.undoMergeCandidate(candidateFixture({ status: 'MERGED' }));

    expect(api.undoMergeCandidatePeople).toHaveBeenCalledWith('candidate-1');
    expect(snackBar.open).toHaveBeenCalledWith('Unificação desfeita.', 'Fechar', { duration: 2500 });
    expect(api.listMergeCandidates).toHaveBeenCalledOnce();
    expect(peopleService.searchPeople).toHaveBeenCalledWith('');

    const error = new Error('undo rejected');
    api.undoMergeCandidatePeople.mockReturnValueOnce(throwError(() => error));
    await expect(service.undoMergeCandidate(candidateFixture({ status: 'MERGED' }))).resolves.toBeUndefined();
    expect(feedback.error).toHaveBeenCalledWith(error, 'Não foi possível desfazer a unificação.');
  });

  it('propagates unhandled refresh and status/delete API failures to the caller', async () => {
    const error = new Error('candidate API failed');
    api.listMergeCandidates.mockReturnValueOnce(throwError(() => error));
    await expect(service.refreshMergeCandidates()).rejects.toBe(error);

    api.updateMergeCandidate.mockReturnValueOnce(throwError(() => error));
    await expect(service.setMergeCandidateStatus(candidateFixture(), 'REJECTED')).rejects.toBe(error);

    api.deleteMergeCandidate.mockReturnValueOnce(throwError(() => error));
    await expect(service.deleteMergeCandidate(candidateFixture())).rejects.toBe(error);
  });
});

function candidateFixture(overrides: Partial<MergeCandidate> = {}): MergeCandidate {
  return {
    id: 'candidate-1',
    personAId: 'person-a',
    personBId: 'person-b',
    pairKey: 'person-a:person-b',
    score: 0.95,
    matchMethod: 'EMAIL',
    matchValue: 'ada@example.edu',
    status: 'PENDING' as MergeCandidateStatus,
    resolvedById: null,
    createdAt: adminFixtureDate,
    updatedAt: adminFixtureDate,
    personA: createAdminPerson({ id: 'person-a', name: 'Ada Lovelace', email: 'ada@example.edu' }),
    personB: createAdminPerson({ id: 'person-b', name: 'Ada Byron', email: 'ada.byron@example.edu' }),
    ...overrides,
  } as MergeCandidate;
}
