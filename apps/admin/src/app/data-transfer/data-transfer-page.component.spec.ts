import { PLATFORM_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { OverlayContainer } from '@angular/cdk/overlay';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, Subject, throwError, type Observable } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { Permission } from '@cacic-fct/shared-permissions';
import {
  TRANSFER_MAX_BYTES,
  type TransferApplyRequest,
  type TransferDocument,
  type TransferResult,
  type TransferUndoResult,
} from '@cacic-fct/shared-data-transfer';
import { DataTransferApiService } from './data-transfer-api.service';
import { TransferPersonReviewComponent } from './transfer-person-review.component';
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

  async function configureTestEnvironment(platformId: 'browser' | 'server'): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [DataTransferPageComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: PLATFORM_ID, useValue: platformId },
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
  }

  async function createFixture(): Promise<void> {
    fixture = TestBed.createComponent(DataTransferPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function recreateFixtureForBrowser(): Promise<void> {
    fixture.destroy();
    TestBed.resetTestingModule();
    routeParams = new BehaviorSubject(convertToParamMap({}));
    await configureTestEnvironment('browser');
    await createFixture();
  }

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
    await configureTestEnvironment('server');
    await createFixture();
  });

  it('preserves a reviewed import while switching tasks and reveals only the selected task', async () => {
    granted.update((permissions) => new Set([...permissions, Permission.DataTransfer.Export]));
    fixture.detectChanges();
    setJsonText();
    clickButton('Revisar importação');
    await fixture.whenStable();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    const originalText = input.value;
    const importPanel = fixture.nativeElement.querySelector(
      '[aria-labelledby="transfer-import-heading"]',
    ) as HTMLElement;
    const exportPanel = fixture.nativeElement.querySelector(
      '[aria-labelledby="transfer-export-heading"]',
    ) as HTMLElement;

    expect(importPanel.hidden).toBe(false);
    expect(exportPanel.hidden).toBe(true);
    clickButton('Exportar');
    expect(importPanel.hidden).toBe(true);
    expect(exportPanel.hidden).toBe(false);
    clickButton('Importar');
    expect(input.value).toBe(originalText);
    expect(importPanel.hidden).toBe(false);
    expect(findButton('Aplicar alterações').disabled).toBe(false);
    expect(api.preview).toHaveBeenCalledOnce();
  });

  it('includes the just-completed batch in the separate history view', async () => {
    const batchId = 'just-completed-batch';
    api.apply.mockReturnValueOnce(of({ ...createTransferResultFixture(), batchId }));
    api.history.mockReturnValue(
      of([
        {
          ...transferBatchSummaryFixture,
          batchId,
        },
      ]),
    );
    setJsonText();
    clickButton('Revisar importação');
    await fixture.whenStable();
    fixture.detectChanges();
    clickButton('Aplicar alterações');
    await fixture.whenStable();
    fixture.detectChanges();
    clickButton('Histórico');
    await fixture.whenStable();
    fixture.detectChanges();
    const historyPanel = fixture.nativeElement.querySelector('.history-panel') as HTMLElement;
    expect(historyPanel.hidden).toBe(false);
    expect(historyPanel.textContent).toContain(batchId);
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
      expect((fixture.nativeElement.querySelector('#transfer-file') as HTMLInputElement).disabled).toBe(true);
      expect(fixture.debugElement.query(By.directive(EventContextPickerComponent))).toBeNull();
      expect(findButton('Histórico').disabled).toBe(true);
      const contextOption = fixture.nativeElement.querySelector('mat-checkbox input') as HTMLInputElement;
      expect(contextOption.disabled).toBe(true);
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
    const currentPreview = createTransferPreviewFixture();
    const freshPreview = { ...createTransferPreviewFixture(), planHash: 'fresh-reviewed-plan' };
    api.preview.mockReturnValueOnce(of(currentPreview)).mockReturnValueOnce(of(freshPreview));
    api.apply
      .mockReturnValueOnce(
        throwError(
          () => new HttpErrorResponse({ status: 409, error: { message: 'A revisão mudou. Revise novamente.' } }),
        ),
      )
      .mockReturnValueOnce(of(createTransferResultFixture()));
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
    expect(fixture.nativeElement.querySelector('.review-section')).toBeNull();

    clickButton('Revisar importação');
    await fixture.whenStable();
    fixture.detectChanges();
    clickButton('Aplicar alterações');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.preview).toHaveBeenCalledTimes(2);
    expect(api.apply).toHaveBeenCalledTimes(2);
    expect(api.apply.mock.calls[1][0].planHash).toBe('fresh-reviewed-plan');
    expect(fixture.nativeElement.textContent).toContain('Importação concluída');
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

  it('warns before unloading edited JSON and stops warning after apply', async () => {
    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(unload()).toBe(false);
    setJsonText();
    expect(unload()).toBe(true);
    clickButton('Revisar importação');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(unload()).toBe(true);
    clickButton('Aplicar alterações');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(unload()).toBe(false);
  });

  it('locks the source and recovery controls while an apply request is still running', async () => {
    const pending = new Subject<TransferResult>();
    api.apply.mockReturnValueOnce(pending);
    setJsonText();
    clickButton('Revisar importação');
    await fixture.whenStable();
    fixture.detectChanges();

    clickButton('Aplicar alterações');

    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    expect(api.apply).toHaveBeenCalledOnce();
    expect(textarea.disabled).toBe(true);
    expect(findButton('Revisar importação').disabled).toBe(true);
    expect(findButton('Verificar resultado / tentar novamente').disabled).toBe(true);
    expect(await fixture.componentInstance.canDeactivate()).toBe(false);

    pending.next(createTransferResultFixture());
    pending.complete();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(textarea.disabled).toBe(false);
    expect(api.apply).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain('Importação concluída');
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

  it('rejects oversized and unreadable files before previewing them', async () => {
    await recreateFixtureForBrowser();
    const input = fixture.nativeElement.querySelector('#transfer-file') as HTMLInputElement;

    async function selectFile(file: { name: string; size: number; text(): Promise<string> }): Promise<void> {
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await fixture.whenStable();
      fixture.detectChanges();
    }

    const oversizedFile = {
      name: 'large.json',
      size: TRANSFER_MAX_BYTES + 1,
      text: vi.fn(async () => '{}'),
    };
    await selectFile(oversizedFile);
    expect(fixture.nativeElement.textContent).toContain('O arquivo excede o limite de 5 MiB.');
    expect(oversizedFile.text).not.toHaveBeenCalled();
    expect(findButton('Revisar importação').disabled).toBe(true);

    const unreadableFile = {
      name: 'unreadable.json',
      size: 12,
      text: vi.fn(() => Promise.reject(new Error('read denied'))),
    };
    await selectFile(unreadableFile);
    expect(fixture.nativeElement.textContent).toContain(
      'Não foi possível ler o arquivo. Escolha outro arquivo ou cole o JSON.',
    );
    expect(findButton('Revisar importação').disabled).toBe(true);
    expect(api.preview).not.toHaveBeenCalled();
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

  it('invalidates a reviewed plan when the import scope changes', async () => {
    granted.set(new Set([Permission.DataTransfer.Import, Permission.Event.Read, Permission.MajorEvent.Read]));
    fixture.detectChanges();
    setJsonText();
    clickButton('Revisar importação');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.review-section')).not.toBeNull();

    toggleCheckbox('Aplicar a um contexto existente');
    const picker = fixture.debugElement.query(By.directive(EventContextPickerComponent))
      .componentInstance as EventContextPickerComponent;
    picker.choose(contextStoryMajor);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.review-section')).toBeNull();
    clickButton('Revisar importação');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.preview).toHaveBeenLastCalledWith({
      document: transferDocumentFixture,
      scope: { kind: 'major-event', id: contextStoryMajor.id },
    });
  });

  it('shows a rejected preview and lets the user retry the same source', async () => {
    api.preview
      .mockReturnValueOnce(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: { issues: [{ message: 'O servidor recusou este documento.' }] },
            }),
        ),
      )
      .mockReturnValueOnce(of(createTransferPreviewFixture()));
    setJsonText();

    clickButton('Revisar importação');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('O servidor recusou este documento.');
    expect(fixture.nativeElement.querySelector('.review-section')).toBeNull();
    expect((fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement).value).toBe(
      JSON.stringify(transferDocumentFixture),
    );

    clickButton('Revisar importação');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.preview).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('.review-section')).not.toBeNull();
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
    api.apply.mockReturnValueOnce(of(createTransferResultFixture(true)));
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
    expect(fixture.nativeElement.textContent).toContain('1 registros foram ignorados conforme sua confirmação.');
    expect(fixture.nativeElement.textContent).toContain('Baixar relatório da importação');
    expect(fixture.nativeElement.textContent).toContain('Baixar JSON com IDs gerados');

    const resolvedDocument = JSON.parse(
      (fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement).value,
    ) as TransferDocument;
    expect(resolvedDocument.resources[0].id).toBeDefined();
    expect(resolvedDocument.resources[0].key).toBeUndefined();
  });

  it('downloads the applied result and resolved JSON instead of the original keyed document', async () => {
    await recreateFixtureForBrowser();
    const createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(window.URL, 'createObjectURL');
    const revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(window.URL, 'revokeObjectURL');
    let objectUrlIndex = 0;
    const createObjectURL = vi.fn((blob: Blob) => {
      expect(blob).toBeInstanceOf(Blob);
      return `blob:transfer-${++objectUrlIndex}`;
    });
    Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const downloads: Array<{ fileName: string; href: string }> = [];
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push({ fileName: this.download, href: this.href });
    });
    api.preview.mockReturnValue(of(createTransferPreviewFixture(true)));
    api.apply.mockReturnValueOnce(of(createTransferResultFixture(true)));

    async function readBlob(blob: Blob): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
      });
    }

    try {
      setJsonText();
      const source = JSON.parse(
        (fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement).value,
      ) as TransferDocument;
      expect(source.resources[0].key).toBeDefined();
      clickButton('Revisar importação');
      await fixture.whenStable();
      fixture.detectChanges();
      toggleCheckbox('Ignorar registros bloqueados');
      clickButton('Revisar importação');
      await fixture.whenStable();
      fixture.detectChanges();
      clickButton('Aplicar alterações');
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('1 registros foram ignorados conforme sua confirmação.');
      clickButton('Baixar relatório da importação');
      clickButton('Baixar JSON com IDs gerados');

      expect(createObjectURL).toHaveBeenCalledTimes(2);
      expect(downloads.map((download) => download.fileName)).toEqual([
        'relatorio-importacao-cacic.json',
        'cacic-eventos-com-ids-gerados.json',
      ]);
      const report = JSON.parse(await readBlob(createObjectURL.mock.calls[0][0])) as TransferResult;
      const resolvedDocument = JSON.parse(await readBlob(createObjectURL.mock.calls[1][0])) as TransferDocument;
      expect(report.applied).toBe(true);
      expect(report.summary.skip).toBe(1);
      expect(report.document?.resources[0].id).toBeDefined();
      expect(report.document?.resources[0].key).toBeUndefined();
      expect(resolvedDocument.resources[0].id).toBeDefined();
      expect(resolvedDocument.resources[0].key).toBeUndefined();
    } finally {
      fixture.destroy();
      anchorClick.mockRestore();
      if (createObjectUrlDescriptor) {
        Object.defineProperty(window.URL, 'createObjectURL', createObjectUrlDescriptor);
      } else {
        Reflect.deleteProperty(window.URL, 'createObjectURL');
      }
      if (revokeObjectUrlDescriptor) {
        Object.defineProperty(window.URL, 'revokeObjectURL', revokeObjectUrlDescriptor);
      } else {
        Reflect.deleteProperty(window.URL, 'revokeObjectURL');
      }
    }
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
    clickButton('Exportar');
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
      includeTickets: false,
      includePublishingState: false,
      includeAudienceInvitations: false,
      includeChildSubscriptions: true,
      includeChildAttendances: true,
    });
  });

  it('exports publishing state and audience invitations only when selected', async () => {
    granted.set(new Set([Permission.DataTransfer.Export, Permission.MajorEvent.Read]));
    fixture.detectChanges();
    const picker = fixture.debugElement.query(By.directive(EventContextPickerComponent))
      .componentInstance as EventContextPickerComponent;
    picker.choose(contextStoryMajor);
    fixture.detectChanges();
    toggleCheckbox('Incluir estado de publicação');
    toggleCheckbox('Incluir convites do público-alvo');
    clickButton('Exportar JSON');
    await fixture.whenStable();
    expect(api.export).toHaveBeenCalledWith(
      expect.objectContaining({
        includePublishingState: true,
        includeAudienceInvitations: true,
      }),
    );
  });

  it('exports all ticket states only after the organizer selects tickets', async () => {
    granted.set(new Set([Permission.DataTransfer.Export, Permission.MajorEvent.Read, Permission.Ticket.Read]));
    fixture.detectChanges();
    const picker = fixture.debugElement.query(By.directive(EventContextPickerComponent))
      .componentInstance as EventContextPickerComponent;
    picker.choose(contextStoryMajor);
    fixture.detectChanges();
    toggleCheckbox('Incluir bilhetes');
    clickButton('Exportar JSON');
    await fixture.whenStable();
    expect(api.export).toHaveBeenCalledWith(
      expect.objectContaining({ includeTickets: true, includeSubscriptions: false, includeAttendances: false }),
    );
    granted.set(new Set([Permission.DataTransfer.Export, Permission.MajorEvent.Read]));
    fixture.detectChanges();
    const checkbox = fixture.debugElement
      .queryAll(By.css('mat-checkbox'))
      .find((element) => element.nativeElement.textContent.includes('Incluir bilhetes'));
    expect(checkbox?.componentInstance.disabled).toBe(true);
  });

  it('keeps export available after a server failure so the user can retry', async () => {
    granted.set(
      new Set([
        Permission.DataTransfer.Import,
        Permission.DataTransfer.Export,
        Permission.Event.Read,
        Permission.MajorEvent.Read,
      ]),
    );
    fixture.detectChanges();
    clickButton('Exportar');
    const picker = fixture.debugElement.query(By.directive(EventContextPickerComponent))
      .componentInstance as EventContextPickerComponent;
    picker.choose(contextStoryMajor);
    api.export
      .mockReturnValueOnce(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 503,
              error: { message: 'A exportação está temporariamente indisponível.' },
            }),
        ),
      )
      .mockReturnValueOnce(of({ document: transferDocumentFixture, issues: [] }));
    fixture.detectChanges();

    clickButton('Exportar JSON');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('A exportação está temporariamente indisponível.');

    clickButton('Exportar JSON');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.export).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.textContent).toContain('Arquivo JSON exportado.');
  });

  it('keeps undo confirmation open after a failure and permits a retry', async () => {
    granted.update((permissions) => new Set([...permissions, Permission.DataTransfer.Undo]));
    fixture.detectChanges();
    setJsonText();
    clickButton('Revisar importação');
    await fixture.whenStable();
    fixture.detectChanges();
    clickButton('Aplicar alterações');
    await fixture.whenStable();
    fixture.detectChanges();
    api.undo
      .mockReturnValueOnce(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 409,
              error: { issues: [{ message: 'Este lote contém alterações posteriores.' }] },
            }),
        ),
      )
      .mockReturnValueOnce(
        of({ batchId: 'fixture-import-batch', auditEntryId: 'fixture-undo-audit', undone: true as const }),
      );

    clickButton('Desfazer esta importação');
    clickButton('Confirmar reversão');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(undoDialog()?.textContent).toContain('Este lote contém alterações posteriores.');
    expect(undoDialog()).not.toBeNull();
    expect(findButton('Confirmar reversão').disabled).toBe(false);

    clickButton('Confirmar reversão');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.undo).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.textContent).toContain('Importação revertida');
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
    expect(undoDialog()?.textContent).toContain('Reverter todas as alterações do lote fixture-import-batch?');
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

  it('retries failed history loads, hides undone actions, and confirms the selected batch', async () => {
    granted.update((permissions) => new Set([...permissions, Permission.DataTransfer.Undo]));
    const undoneBatch = {
      ...transferBatchSummaryFixture,
      batchId: 'already-undone-batch',
      auditEntryId: 'already-undone-audit',
      undone: true,
    };
    const activeBatch = {
      ...transferBatchSummaryFixture,
      batchId: 'selected-history-batch',
      auditEntryId: 'selected-history-audit',
    };
    api.history
      .mockReturnValueOnce(
        throwError(
          () => new HttpErrorResponse({ status: 503, error: { message: 'Histórico temporariamente indisponível.' } }),
        ),
      )
      .mockReturnValueOnce(of([undoneBatch, activeBatch]))
      .mockReturnValueOnce(of([]));

    clickButton('Atualizar histórico');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Histórico temporariamente indisponível.');

    clickButton('Atualizar histórico');
    await fixture.whenStable();
    fixture.detectChanges();
    const rows = [...fixture.nativeElement.querySelectorAll('.batch-history-row')] as HTMLLIElement[];
    const undoneRow = rows.find((row) => row.textContent?.includes(undoneBatch.batchId));
    const activeRow = rows.find((row) => row.textContent?.includes(activeBatch.batchId));
    expect(rows).toHaveLength(2);
    expect(undoneRow?.querySelector('button')).toBeNull();
    const activeButton = activeRow?.querySelector('button');
    expect(activeButton).not.toBeNull();
    activeButton?.click();
    fixture.detectChanges();
    expect(undoDialog()?.textContent).toContain(`Reverter todas as alterações do lote ${activeBatch.batchId}?`);
    expect(api.undo).not.toHaveBeenCalled();

    clickButton('Cancelar');
    clickButton('Atualizar histórico');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Nenhuma importação recente disponível');
    expect(fixture.nativeElement.querySelector('.batch-history')).toBeNull();
  });

  it.each([false, undefined])('does not undo a history batch when the dialog is dismissed with %s', async (result) => {
    granted.set(new Set([Permission.DataTransfer.Undo]));
    fixture.detectChanges();
    clickButton('Desfazer este lote');
    expect(undoDialog()).not.toBeNull();
    expect(api.undo).not.toHaveBeenCalled();

    TestBed.inject(MatDialog).openDialogs[0].close(result);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(undoDialog()).toBeNull();
    expect(api.undo).not.toHaveBeenCalled();

    clickButton('Desfazer este lote');
    expect(undoDialog()?.textContent).toContain('fixture-history-batch');
    clickButton('Cancelar');
    await fixture.whenStable();
    expect(api.undo).not.toHaveBeenCalled();
  });

  it('locks undo while it is running and removes the action after success', async () => {
    granted.update((permissions) => new Set([...permissions, Permission.DataTransfer.Undo]));
    setJsonText();
    clickButton('Revisar importação');
    await fixture.whenStable();
    fixture.detectChanges();
    clickButton('Aplicar alterações');
    await fixture.whenStable();
    fixture.detectChanges();

    const pendingUndo = new Subject<TransferUndoResult>();
    api.undo.mockReturnValueOnce(pendingUndo);
    clickButton('Desfazer esta importação');
    clickButton('Confirmar reversão');

    expect(api.undo).toHaveBeenCalledOnce();
    expect(findButton('Confirmar reversão').disabled).toBe(true);
    expect(findButton('Cancelar').disabled).toBe(true);
    expect(findButton('Desfazer esta importação').disabled).toBe(true);

    pendingUndo.next({ batchId: 'fixture-import-batch', auditEntryId: 'fixture-undo-audit', undone: true });
    pendingUndo.complete();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Importação revertida');
    expect(
      [...fixture.nativeElement.querySelectorAll('button')].some((button) =>
        button.textContent.includes('Desfazer esta importação'),
      ),
    ).toBe(false);
  });

  it.each(['create', 'skip', 'merge'] as const)(
    'collects a person %s choice and requires a new full preview before applying',
    async (action) => {
      const initial = {
        ...createTransferPreviewFixture(),
        canApply: false,
        personPrompts: [{ key: 'a'.repeat(64), data: { name: 'Ana Silva' }, message: 'Revise a pessoa.' }],
      };
      api.preview.mockReturnValueOnce(of(initial)).mockReturnValueOnce(of(createTransferPreviewFixture()));
      setJsonText();
      clickButton('Revisar importação');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(findButton('Aplicar alterações').disabled).toBe(true);
      const review = fixture.debugElement.query(By.directive(TransferPersonReviewComponent))
        .componentInstance as TransferPersonReviewComponent;
      const decision =
        action === 'skip'
          ? { key: 'a'.repeat(64), action }
          : action === 'merge'
            ? { key: 'a'.repeat(64), action, personId: 'person-1', data: { email: 'ana@example.com' } }
            : { key: 'a'.repeat(64), action, data: { email: 'ana@example.com' } };
      review.decision.emit(decision);
      fixture.detectChanges();
      expect(api.apply).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('.review-section')).toBeNull();
      clickButton('Revisar importação');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(api.preview).toHaveBeenNthCalledWith(2, expect.objectContaining({ personDecisions: [decision] }));
      clickButton('Aplicar alterações');
      await fixture.whenStable();
      expect(api.apply.mock.calls[0][0]).toMatchObject({ personDecisions: [decision] });
    },
  );

  it('uses only the user’s authorized transfer action', () => {
    granted.set(new Set([Permission.DataTransfer.Export, Permission.Event.Read]));
    fixture.destroy();
    fixture = TestBed.createComponent(DataTransferPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[aria-labelledby="transfer-export-heading"]').hidden).toBe(false);
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

  function undoDialog(): HTMLElement | null {
    return TestBed.inject(OverlayContainer).getContainerElement().querySelector('[role="dialog"]');
  }

  function findButton(name: string): HTMLButtonElement {
    const buttons = [
      ...(undoDialog()?.querySelectorAll('button') ?? []),
      ...fixture.nativeElement.querySelectorAll('button'),
    ];
    const button = buttons.find((node) => node.textContent.includes(name));
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
