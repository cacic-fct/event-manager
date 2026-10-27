import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AuditLogEntry } from '@cacic-fct/event-manager-admin-contracts';
import { Subject, of, throwError } from 'rxjs';
import { AdminFeedbackService } from '../../feedback/admin-feedback.service';
import { AuditLogApiService } from '../../graphql/audit-log-api.service';
import { AuditLogDialogComponent, AuditLogDialogData } from './audit-log-dialog.component';

const PAGE_SIZE = 50;

describe('AuditLogDialogComponent history paging', () => {
  it('loads histories beyond the first 80 entries using bounded pages', async () => {
    const api = {
      listEntityHistory: vi.fn((_input: unknown, _take: number, skip: number) =>
        of(skip === 0 ? Array.from({ length: PAGE_SIZE + 1 }, (_, index) => auditEntry(index)) : nextPage()),
      ),
      revertEntry: vi.fn(),
    };
    const { fixture } = await createFixture(api);

    expect(historyEntries(fixture)).toHaveLength(PAGE_SIZE);
    expect(api.listEntityHistory).toHaveBeenNthCalledWith(1, personHistoryInput, PAGE_SIZE + 1, 0);

    button(fixture, 'Carregar mais').click();
    await settle(fixture);

    expect(historyEntries(fixture)).toHaveLength(81);
    expect(api.listEntityHistory).toHaveBeenNthCalledWith(2, personHistoryInput, PAGE_SIZE + 1, PAGE_SIZE);
    expect(buttonOrNull(fixture, 'Carregar mais')).toBeNull();
  });

  it('moves focus to the first appended history entry when the load-more button disappears', async () => {
    const api = {
      listEntityHistory: vi.fn((_input: unknown, _take: number, skip: number) =>
        of(skip === 0 ? Array.from({ length: PAGE_SIZE + 1 }, (_, index) => auditEntry(index)) : nextPage()),
      ),
      revertEntry: vi.fn(),
    };
    const { fixture } = await createFixture(api);

    button(fixture, 'Carregar mais').click();
    await settle(fixture);

    const firstNewEntry = fixture.nativeElement.querySelector('[data-audit-entry-id="audit-51"]') as HTMLElement | null;
    expect(firstNewEntry).not.toBeNull();
    expect(firstNewEntry?.tabIndex).toBe(-1);
    expect(fixture.nativeElement.ownerDocument.activeElement).toBe(firstNewEntry);
    expect(buttonOrNull(fixture, 'Carregar mais')).toBeNull();
  });

  it('preserves loaded rows and retries a failed page at the same offset', async () => {
    let loadMoreAttempts = 0;
    const api = {
      listEntityHistory: vi.fn((_input: unknown, _take: number, skip: number) => {
        if (skip === 0) {
          return of(Array.from({ length: PAGE_SIZE + 1 }, (_, index) => auditEntry(index)));
        }
        loadMoreAttempts += 1;
        return loadMoreAttempts === 1 ? throwError(() => new Error('Rede indisponível.')) : of(nextPage());
      }),
      revertEntry: vi.fn(),
    };
    const { fixture } = await createFixture(api);

    button(fixture, 'Carregar mais').click();
    await settle(fixture);

    expect(historyEntries(fixture)).toHaveLength(PAGE_SIZE);
    expect(fixture.nativeElement.textContent).toContain('Rede indisponível.');
    expect(api.listEntityHistory).toHaveBeenNthCalledWith(2, personHistoryInput, PAGE_SIZE + 1, PAGE_SIZE);

    button(fixture, 'Tentar carregar novamente').click();
    await settle(fixture);

    expect(historyEntries(fixture)).toHaveLength(81);
    expect(api.listEntityHistory).toHaveBeenNthCalledWith(3, personHistoryInput, PAGE_SIZE + 1, PAGE_SIZE);
  });

  it('ignores a stale load-more response after the history is refreshed', async () => {
    const stalePage = new Subject<AuditLogEntry[]>();
    let firstPageRequestCount = 0;
    const api = {
      listEntityHistory: vi.fn((_input: unknown, _take: number, skip: number) => {
        if (skip > 0) {
          return stalePage;
        }
        firstPageRequestCount += 1;
        const prefix = firstPageRequestCount === 1 ? 'old' : 'fresh';
        return of(Array.from({ length: PAGE_SIZE + 1 }, (_, index) => auditEntry(index, { id: `${prefix}-${index}` })));
      }),
      revertEntry: vi.fn(),
    };
    const { fixture } = await createFixture(api);

    button(fixture, 'Carregar mais').click();
    fixture.detectChanges();
    await (fixture.componentInstance as unknown as { load: () => Promise<void> }).load();
    await settle(fixture);

    stalePage.next(
      Array.from({ length: PAGE_SIZE + 1 }, (_, index) => auditEntry(index + PAGE_SIZE, { id: `stale-${index}` })),
    );
    stalePage.complete();
    await settle(fixture);

    expect(historyEntries(fixture)).toHaveLength(PAGE_SIZE);
    expect(fixture.nativeElement.textContent).toContain('Atualização 1.');
    expect(fixture.nativeElement.textContent).not.toContain('stale-');
    expect(api.listEntityHistory).toHaveBeenNthCalledWith(3, personHistoryInput, PAGE_SIZE + 1, 0);
  });

  it('ignores a deferred load-more response after the dialog is destroyed', async () => {
    const deferredPage = new Subject<AuditLogEntry[]>();
    const api = {
      listEntityHistory: vi.fn((_input: unknown, _take: number, skip: number) =>
        of(skip === 0 ? Array.from({ length: PAGE_SIZE + 1 }, (_, index) => auditEntry(index)) : deferredPage),
      ),
      revertEntry: vi.fn(),
    };
    const { fixture } = await createFixture(api);
    const component = fixture.componentInstance as unknown as {
      entries: () => AuditLogEntry[];
      loadMore: () => Promise<void>;
    };
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    const pendingLoad = component.loadMore();

    expect(component.entries()).toHaveLength(PAGE_SIZE);
    fixture.destroy();
    deferredPage.next(nextPage());
    deferredPage.complete();
    await pendingLoad;

    expect(component.entries()).toHaveLength(PAGE_SIZE);
    expect(focusSpy).not.toHaveBeenCalled();
    focusSpy.mockRestore();
  });

  it('labels related lecturer-profile rows with their own entity context', async () => {
    const profileEntry = auditEntry(0, {
      entityType: 'LECTURER_PROFILE',
      entityId: 'profile-1',
      entityLabel: 'Ana Silva',
      summary: 'Perfil de palestrante atualizado.',
    });
    const api = {
      listEntityHistory: vi.fn(() => of([profileEntry])),
      revertEntry: vi.fn(),
    };
    const { fixture } = await createFixture(api);

    expect(fixture.nativeElement.querySelector('.entry-context')?.textContent).toContain(
      'Perfil de palestrante: Ana Silva',
    );
    expect(fixture.nativeElement.textContent).toContain('Perfil de palestrante atualizado.');
  });
});

const personHistoryInput = { entityType: 'PERSON', entityId: 'person-1' } as const;

async function createFixture(api: {
  listEntityHistory: ReturnType<typeof vi.fn>;
  revertEntry: ReturnType<typeof vi.fn>;
}): Promise<{ fixture: ComponentFixture<AuditLogDialogComponent> }> {
  await TestBed.configureTestingModule({
    imports: [AuditLogDialogComponent],
    providers: [
      provideNoopAnimations(),
      { provide: MAT_DIALOG_DATA, useValue: { ...personHistoryInput, entityLabel: 'Ana Silva' } as AuditLogDialogData },
      { provide: AuditLogApiService, useValue: api },
      { provide: MatDialog, useValue: { open: vi.fn() } },
      { provide: MatSnackBar, useValue: { open: vi.fn() } },
      { provide: AdminFeedbackService, useValue: { error: vi.fn() } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(AuditLogDialogComponent);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture };
}

async function settle(fixture: ComponentFixture<AuditLogDialogComponent>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function historyEntries(fixture: ComponentFixture<AuditLogDialogComponent>): Element[] {
  return [...fixture.nativeElement.querySelectorAll('.history-entry')];
}

function button(fixture: ComponentFixture<AuditLogDialogComponent>, label: string): HTMLButtonElement {
  const element = buttonOrNull(fixture, label);
  if (!element) {
    throw new Error(`Button ${label} was not found.`);
  }
  return element;
}

function buttonOrNull(fixture: ComponentFixture<AuditLogDialogComponent>, label: string): HTMLButtonElement | null {
  return (
    ([...fixture.nativeElement.querySelectorAll('button')].find((element) =>
      (element.textContent as string).includes(label),
    ) as HTMLButtonElement | undefined) ?? null
  );
}

function nextPage(): AuditLogEntry[] {
  return Array.from({ length: 31 }, (_, index) => auditEntry(index + PAGE_SIZE));
}

function auditEntry(index: number, overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  const recordedAt = '2026-06-22T12:00:00.000Z';
  return {
    id: `audit-${index + 1}`,
    entityType: 'PERSON',
    entityId: 'person-1',
    entityLabel: 'Ana Silva',
    operation: 'UPDATE',
    summary: `Atualização ${index + 1}.`,
    actorId: 'admin-1',
    actorName: 'Admin',
    actorEmail: null,
    actorType: 'USER',
    permission: 'person#update',
    eventId: null,
    majorEventId: null,
    eventGroupId: null,
    changes: [],
    changedFields: [],
    groupedCount: 1,
    firstRecordedAt: recordedAt,
    lastRecordedAt: recordedAt,
    createdAt: recordedAt,
    revertedAt: null,
    revertedById: null,
    revertedByName: null,
    revertedByEntryId: null,
    revertTargetId: null,
    revertMode: null,
    canRevert: false,
    ...overrides,
  };
}
