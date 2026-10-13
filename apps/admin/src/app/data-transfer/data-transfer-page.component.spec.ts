import { PLATFORM_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, Subject, throwError, type Observable } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { Permission } from '@cacic-fct/shared-permissions';
import type { TransferApplyRequest, TransferDocument, TransferResult } from '@cacic-fct/shared-data-transfer';
import { DataTransferApiService } from './data-transfer-api.service';
import { DataTransferPageComponent } from './data-transfer-page.component';
import {
  createTransferPreviewFixture,
  createTransferResultFixture,
  transferBatchSummaryFixture,
  transferDocumentFixture,
} from './data-transfer-page.fixtures';
import { WorkspacePendingChangesService } from '../app-shell/workspace-pending-changes.service';
import { AdminEventContextApiService } from '../graphql/admin-event-context-api.service';
import { EventApiService } from '../graphql/event-api.service';
import { EventGroupApiService } from '../graphql/event-group-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { PermissionsService } from '../permissions/permissions.service';
import { ADMIN_SHELL_CONTEXT } from '../shared/admin-shell-context';
import { EventContextPickerComponent } from '../shared/event-context-picker.component';
import { contextStoryMajor } from '../shared/event-context-story.fixtures';

describe('DataTransferPageComponent', () => {
  const granted = signal<Set<string>>(new Set());
  const api = {
    getSchema: vi.fn(() => of({ type: 'object' })),
    export: vi.fn(() => of({ document: transferDocumentFixture, issues: [] })),
    preview: vi.fn(() => of(createTransferPreviewFixture())),
    apply: vi.fn<(request: TransferApplyRequest) => Observable<TransferResult>>(() =>
      of(createTransferResultFixture()),
    ),
    undo: vi.fn(() =>
      of({ batchId: 'fixture-import-batch', auditEntryId: 'fixture-undo-audit', undone: true as const }),
    ),
    history: vi.fn(() => of([transferBatchSummaryFixture])),
  };
  const permissionService = {
    has: (permission: string) => granted().has(permission),
    hasAny: (permissions: string[]) => permissions.some((permission) => granted().has(permission)),
    hasAll: (permissions: string[]) => permissions.every((permission) => granted().has(permission)),
    canReadTab: () => false,
  };
  const pendingChanges = {
    register: vi.fn(() => ({ set: vi.fn(), destroy: vi.fn() })),
    canDeactivate: vi.fn(async () => true),
  };
  let fixture: ComponentFixture<DataTransferPageComponent>;
  let routeParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    routeParams = new BehaviorSubject(convertToParamMap({}));
    granted.set(new Set([Permission.DataTransfer.Import, Permission.Event.Read]));
    api.getSchema.mockReturnValue(of({ type: 'object' }));
    api.export.mockReturnValue(of({ document: transferDocumentFixture, issues: [] }));
    api.preview.mockReturnValue(of(createTransferPreviewFixture()));
    api.apply.mockReturnValue(of(createTransferResultFixture()));
    api.undo.mockReturnValue(of({ batchId: 'fixture-import-batch', auditEntryId: 'fixture-undo-audit', undone: true }));
    api.history.mockReturnValue(of([transferBatchSummaryFixture]));
    await TestBed.configureTestingModule({
      imports: [DataTransferPageComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: PLATFORM_ID, useValue: 'server' },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: routeParams.asObservable(),
            snapshot: { paramMap: convertToParamMap({}), data: {} },
          },
        },
        { provide: ADMIN_SHELL_CONTEXT, useValue: false },
        { provide: DataTransferApiService, useValue: api },
        { provide: PermissionsService, useValue: permissionService },
        { provide: WorkspacePendingChangesService, useValue: pendingChanges },
        { provide: AdminEventContextApiService, useValue: { listPage: () => of({ nodes: [], nextCursor: null }) } },
        { provide: EventApiService, useValue: { getEvent: vi.fn() } },
        { provide: EventGroupApiService, useValue: { getEventGroup: vi.fn() } },
        { provide: MajorEventApiService, useValue: { getMajorEvent: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DataTransferPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it.each([0, 500])(
    'recovers an uncertain %s response using the exact request and blocks new imports',
    async (status) => {
      api.apply.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status })));
      setJsonText();
      clickButton('Revisar importação');
      await fixture.whenStable();
      fixture.detectChanges();
      clickButton('Aplicar alterações');
      await fixture.whenStable();
      fixture.detectChanges();
      const originalRequest = api.apply.mock.calls[0][0];
      expect(findButton('Revisar importação').disabled).toBe(true);
      expect((fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement).disabled).toBe(true);
      expect(await fixture.componentInstance.canDeactivate()).toBe(false);
      expect(fixture.nativeElement.textContent).toContain('A importação pode ter sido salva');

      clickButton('Verificar resultado / tentar novamente');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(api.apply.mock.calls[1][0]).toBe(originalRequest);
      expect(api.preview).toHaveBeenCalledTimes(1);
      expect(fixture.nativeElement.textContent).toContain('Importação concluída');
      expect(findButton('Revisar importação').disabled).toBe(false);
    },
  );

  it('allows a fresh review after an explicit rejection without committing', async () => {
    api.apply.mockReturnValueOnce(
      throwError(
        () => new HttpErrorResponse({ status: 409, error: { message: 'A revisão mudou. Revise novamente.' } }),
      ),
    );
    setJsonText();
    clickButton('Revisar importação');
    await fixture.whenStable();
    fixture.detectChanges();
    clickButton('Aplicar alterações');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(findButton('Revisar importação').disabled).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('A revisão mudou');
    expect(fixture.nativeElement.textContent).not.toContain('Verificar resultado / tentar novamente');
  });

  it('shows record names and Portuguese field labels, with Apply after the comparison', async () => {
    const preview = createTransferPreviewFixture();
    preview.items[0].label = 'Evento de abertura';
    api.preview.mockReturnValueOnce(of(preview));
    setJsonText();
    clickButton('Revisar importação');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Evento de abertura');
    expect(fixture.nativeElement.querySelector('.change-table tbody th').textContent).toBe('Nome');
    const comparison = fixture.nativeElement.querySelector('.review-list') as HTMLElement;
    expect(
      comparison.compareDocumentPosition(findButton('Aplicar alterações')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('As alterações entram em vigor imediatamente.');
  });

  it('validates locally, previews current and proposed fields, and applies the reviewed hash', async () => {
    setJsonText();
    clickButton('Revisar importação');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.preview).toHaveBeenCalledWith({ document: transferDocumentFixture });
    expect(fixture.nativeElement.textContent).toContain('Valor atual');
    expect(fixture.nativeElement.textContent).toContain('Valor proposto');
    expect(fixture.nativeElement.textContent).toContain('Novo evento');

    clickButton('Aplicar alterações');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.apply).toHaveBeenCalledWith({
      document: transferDocumentFixture,
      planHash: 'fixture-reviewed-plan',
      allowPartial: false,
      allocationToken: 'fixture-allocation-token',
    });
    expect(fixture.nativeElement.textContent).toContain('Importação concluída');
    expect(fixture.nativeElement.textContent).toContain('Baixar relatório da importação');
    expect(fixture.nativeElement.textContent).toContain('Baixar JSON com IDs gerados');

    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    const resolvedDocument = JSON.parse(textarea.value) as TransferDocument;
    expect(resolvedDocument.resources[0].id).toBeDefined();
    expect(resolvedDocument.resources[0].key).toBeUndefined();
    clickButton('Revisar importação');
    await fixture.whenStable();
    expect(api.preview).toHaveBeenLastCalledWith({ document: resolvedDocument });
  });

  it('shows schema issues before any server preview call', async () => {
    setJsonText('{"format":"desconhecido"}');
    clickButton('Revisar importação');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.preview).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Revise o JSON antes de continuar.');
    expect(fixture.nativeElement.textContent).toContain('Estrutura incompatível');
  });

  it('selects and locks the template kind to its routed context', () => {
    routeParams.next(convertToParamMap({ kind: 'group', targetId: 'group-existing' }));
    fixture.detectChanges();

    const selector = fixture.nativeElement.querySelector('.utility-panel mat-select') as HTMLElement;
    expect(selector.getAttribute('aria-disabled')).toBe('true');
    expect(selector.textContent).toContain('Grupo de eventos');
    expect(fixture.nativeElement.textContent).toContain('registros filhos vinculados ao contexto atual');
  });

  it('invalidates a reviewed plan whenever the JSON text changes', async () => {
    setJsonText();
    clickButton('Revisar importação');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.review-section')).not.toBeNull();

    setJsonText(JSON.stringify({ ...transferDocumentFixture, version: 99 }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.review-section')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Aplicar alterações');
  });

  it('requires a new review when the server allocation has expired', async () => {
    const preview = createTransferPreviewFixture();
    api.preview.mockReturnValueOnce(
      of({
        ...preview,
        allocation: {
          token: preview.allocation?.token ?? 'expired-allocation',
          expiresAt: new Date(Date.now() - 1_000).toISOString(),
          ids: preview.allocation?.ids ?? {},
        },
      }),
    );
    setJsonText();
    clickButton('Revisar importação');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Esta revisão expirou.');
    expect(findButton('Aplicar alterações').disabled).toBe(true);
  });

  it('requires fresh review after consenting to skip blocked records', async () => {
    api.preview.mockReturnValue(of(createTransferPreviewFixture(true)));
    setJsonText();
    clickButton('Revisar importação');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Ignorar registros bloqueados');

    const checkbox = fixture.nativeElement.querySelector('.partial-approval input') as HTMLInputElement;
    checkbox.click();
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.review-section')).toBeNull();

    clickButton('Revisar importação');
    await fixture.whenStable();
    fixture.detectChanges();
    const applyButton = findButton('Aplicar alterações');
    expect(applyButton.disabled).toBe(false);

    clickButton('Aplicar alterações');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.apply).toHaveBeenCalledWith(
      expect.objectContaining({ planHash: 'fixture-reviewed-plan', allowPartial: true }),
    );
  });

  it('exports root and child participation independently of child hierarchy', async () => {
    granted.set(
      new Set([
        Permission.DataTransfer.Import,
        Permission.DataTransfer.Export,
        Permission.Event.Read,
        Permission.EventGroup.Read,
        Permission.MajorEvent.Read,
        Permission.Subscription.Read,
        Permission.EventAttendance.Read,
      ]),
    );
    fixture.detectChanges();
    const picker = fixture.debugElement.query(By.directive(EventContextPickerComponent))
      .componentInstance as EventContextPickerComponent;
    picker.choose(contextStoryMajor);
    fixture.detectChanges();

    toggleCheckbox('Incluir inscrições deste grande evento');
    toggleCheckbox('Incluir inscrições dos eventos e grupos filhos');
    toggleCheckbox('Incluir presenças dos eventos filhos');
    toggleCheckbox('Incluir eventos e grupos filhos');
    clickButton('Exportar JSON');
    await fixture.whenStable();

    expect(api.export).toHaveBeenCalledWith({
      target: { kind: 'major-event', id: contextStoryMajor.id },
      includeDescendants: false,
      includeConfiguration: true,
      includeSubscriptions: true,
      includeAttendances: false,
      includeChildSubscriptions: true,
      includeChildAttendances: true,
    });
  });

  it('requires explicit confirmation before undoing a committed batch', async () => {
    granted.update((permissions) => new Set([...permissions, Permission.DataTransfer.Undo]));
    fixture.detectChanges();
    setJsonText();
    clickButton('Revisar importação');
    await fixture.whenStable();
    fixture.detectChanges();
    clickButton('Aplicar alterações');
    await fixture.whenStable();
    fixture.detectChanges();

    clickButton('Desfazer esta importação');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Reverter todas as alterações do lote fixture-import-batch?');
    expect(api.undo).not.toHaveBeenCalled();

    clickButton('Confirmar reversão');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.undo).toHaveBeenCalledWith('fixture-import-batch');
    expect(fixture.nativeElement.textContent).toContain('Importação revertida');
    expect(fixture.nativeElement.textContent).toContain('fixture-undo-audit');
  });

  it('shows recent batches to an undo-only user', async () => {
    granted.set(new Set([Permission.DataTransfer.Undo]));
    fixture.destroy();
    fixture = TestBed.createComponent(DataTransferPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Importações recentes');
    expect(fixture.nativeElement.textContent).toContain('fixture-history-batch');
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Desfazer este lote');
  });

  it('uses only the user’s authorized transfer action', () => {
    granted.set(new Set([Permission.DataTransfer.Export, Permission.Event.Read]));
    fixture.destroy();
    fixture = TestBed.createComponent(DataTransferPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Você pode exportar dados');
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
    expect(api.preview).not.toHaveBeenCalled();
  });

  it('ignores a stale preview response after the user edits the source', async () => {
    const delayed = new Subject<ReturnType<typeof createTransferPreviewFixture>>();
    api.preview.mockReturnValueOnce(delayed);
    setJsonText();
    clickButton('Revisar importação');
    fixture.detectChanges();

    setJsonText(JSON.stringify({ ...transferDocumentFixture, version: 99 }));
    delayed.next(createTransferPreviewFixture());
    delayed.complete();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.review-section')).toBeNull();
  });

  function setJsonText(value = JSON.stringify(transferDocumentFixture)): void {
    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = value;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function findButton(name: string): HTMLButtonElement {
    const button = [...fixture.nativeElement.querySelectorAll('button')].find((node) =>
      node.textContent.includes(name),
    );
    if (!button) {
      throw new Error(`Button ${name} was not found.`);
    }
    return button as HTMLButtonElement;
  }

  function clickButton(name: string): void {
    findButton(name).click();
    fixture.detectChanges();
  }

  function toggleCheckbox(name: string): void {
    const checkbox = [...fixture.nativeElement.querySelectorAll('mat-checkbox')].find((node) =>
      node.textContent.includes(name),
    );
    const input = checkbox?.querySelector('input') as HTMLInputElement | null;
    if (!input) {
      throw new Error(`Checkbox ${name} was not found.`);
    }
    input.click();
    fixture.detectChanges();
  }
});
