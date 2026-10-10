import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { FormControl } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { Permission } from '@cacic-fct/shared-permissions';
import {
  adminFixtureDateFromNow,
  createAdminReceiptValidationQueue,
  createAdminReceiptValidationQueueItem,
} from '../../testing/admin-entity-fixtures';
import { AdminFeedbackService } from '../../feedback/admin-feedback.service';
import { PermissionsService } from '../../permissions/permissions.service';
import {
  ReceiptValidationApiService,
  type ReceiptValidationQueue,
} from '../../graphql/receipt-validation-api.service';
import { ReceiptValidationPageComponent } from './receipt-validation-page.component';

const subscriptionItem = createAdminReceiptValidationQueueItem({
  subscriptionId: 'subscription-old-edit',
  personName: 'Marina da Silva',
  subscriptionUpdatedAt: adminFixtureDateFromNow(-3, 10),
  subscriptionCreatedAt: adminFixtureDateFromNow(-1, 12),
});
const ticketItem = createAdminReceiptValidationQueueItem({
  category: 'TICKET',
  subscriptionId: 'ticket-purchase-row',
  purchaseId: 'purchase-1',
  ticketName: 'Acesso à festa de boas-vindas',
  personName: 'João Pedro Oliveira',
  paymentTier: 'Visitante',
  subscriptionUpdatedAt: adminFixtureDateFromNow(-2, 10),
  subscriptionCreatedAt: adminFixtureDateFromNow(-3, 12),
});

interface SetupOptions {
  queue?: ReceiptValidationQueue;
  refreshedQueue?: ReceiptValidationQueue;
  approvalResult?: boolean;
  permissions?: readonly string[];
}

function setup(options: SetupOptions = {}) {
  const queue = options.queue ?? createAdminReceiptValidationQueue({ items: [subscriptionItem, ticketItem] });
  const refreshedQueue = options.refreshedQueue ?? createAdminReceiptValidationQueue({ items: [] });
  const api = {
    watchQueue: vi.fn(() => of(queue)),
    getQueue: vi.fn(() => of(refreshedQueue)),
    approve: vi.fn(() => of({ actionId: 'receipt-action-1', item: queue.items[0] ?? subscriptionItem })),
    reject: vi.fn(() => of({ actionId: 'receipt-action-2', item: queue.items[0] ?? subscriptionItem })),
    approveTicketPurchase: vi.fn(() => of(options.approvalResult ?? true)),
    rejectTicketPurchase: vi.fn(() => of(true)),
    undo: vi.fn(() => of(queue.items[0] ?? subscriptionItem)),
  };
  const feedback = { showErrorMessage: vi.fn() };
  TestBed.configureTestingModule({
    imports: [NoopAnimationsModule, ReceiptValidationPageComponent],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ majorEventId: 'major-event-1' }) } } },
      { provide: ReceiptValidationApiService, useValue: api },
      { provide: PermissionsService, useValue: {
        has: (permission: string) => options.permissions?.includes(permission) ?? true,
        hasAny: (permissions: string[]) => options.permissions ? permissions.some((permission) => options.permissions?.includes(permission)) : true,
      } },
      { provide: AdminFeedbackService, useValue: feedback },
      { provide: MatSnackBar, useValue: { open: vi.fn(() => ({ onAction: () => of(undefined) })) } },
    ],
  });
  const fixture = TestBed.createComponent(ReceiptValidationPageComponent);
  return { fixture, api, feedback };
}

async function settle(fixture: ComponentFixture<ReceiptValidationPageComponent>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function button(fixture: ComponentFixture<ReceiptValidationPageComponent>, label: string): HTMLButtonElement | null {
  return [...fixture.nativeElement.querySelectorAll('button')].find((candidate: HTMLButtonElement) =>
    candidate.getAttribute('aria-label') === label || candidate.textContent?.replace(/\s+/g, ' ').trim().includes(label),
  ) ?? null;
}

async function applyTicketFilter(fixture: ComponentFixture<ReceiptValidationPageComponent>): Promise<void> {
  button(fixture, 'Filtros')?.click();
  fixture.detectChanges();
  await vi.waitFor(() => expect(document.body.querySelector('[role="dialog"]')).not.toBeNull());
  const dialog = TestBed.inject(MatDialog).openDialogs.at(-1);
  expect(dialog).toBeDefined();
  const controls = dialog?.componentInstance as unknown as {
    categoryControl: FormControl<'ALL' | 'SUBSCRIPTION' | 'TICKET'>;
  };
  controls.categoryControl.setValue('TICKET');
  fixture.detectChanges();
  [...document.body.querySelectorAll('button')]
    .find((candidate) => candidate.textContent?.includes('Aplicar filtros'))
    ?.click();
  await vi.waitFor(() => expect(document.body.querySelector('[role="dialog"]')).toBeNull());
  await settle(fixture);
}

describe('ReceiptValidationPageComponent queue review', () => {
  it.each([Permission.Receipt.Approve, Permission.Receipt.Reject])('shows only the authorized ticket action for %s', async (permission) => {
    const { fixture } = setup({ queue: createAdminReceiptValidationQueue({ items: [ticketItem] }), permissions: [permission, Permission.Frozen.Update] });
    await settle(fixture);
    expect(Boolean(button(fixture, 'Aprovar comprovante'))).toBe(permission === Permission.Receipt.Approve);
    expect(Boolean(button(fixture, 'Recusar comprovante'))).toBe(permission === Permission.Receipt.Reject);
    fixture.destroy();
  });

  it('starts with the oldest edit and combines both receipt types with protected previews', async () => {
    const { fixture, api } = setup();
    await settle(fixture);

    expect(api.watchQueue).toHaveBeenCalledWith('major-event-1');
    expect(fixture.nativeElement.querySelector('mat-card-title')?.textContent).toContain('Marina da Silva');
    expect(fixture.nativeElement.textContent).toContain('1 de 2');
    expect(fixture.nativeElement.querySelector('.receipt-image-shell img')?.getAttribute('alt')).toBe('Comprovante enviado');

    await applyTicketFilter(fixture);
    expect(fixture.nativeElement.querySelector('mat-card-title')?.textContent).toContain('João Pedro Oliveira');
    expect(fixture.nativeElement.textContent).toContain('Acesso à festa de boas-vindas');
    expect(fixture.nativeElement.textContent).toContain('Comprovante de bilhete');
    expect(fixture.nativeElement.textContent).toContain('1 de 1');
    expect(fixture.nativeElement.querySelector('.receipt-image-shell img')?.getAttribute('alt')).toBe('Comprovante enviado');
  });

  it('keeps the reviewed item selected when sorting moves it to a new position', async () => {
    const third = createAdminReceiptValidationQueueItem({
      subscriptionId: 'subscription-third',
      personName: 'Ada Lovelace',
      subscriptionUpdatedAt: adminFixtureDateFromNow(-1, 10),
      subscriptionCreatedAt: adminFixtureDateFromNow(-3, 12),
    });
    const queue = createAdminReceiptValidationQueue({
      items: [
        subscriptionItem,
        createAdminReceiptValidationQueueItem({
          subscriptionId: 'subscription-current',
          personName: 'Grace Hopper',
          subscriptionUpdatedAt: adminFixtureDateFromNow(-2, 10),
          subscriptionCreatedAt: adminFixtureDateFromNow(-4, 12),
        }),
        third,
      ],
    });
    const { fixture } = setup({ queue });
    await settle(fixture);
    button(fixture, 'Próximo comprovante')?.click();
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('mat-card-title')?.textContent).toContain('Grace Hopper');

    button(fixture, 'Filtros')?.click();
    fixture.detectChanges();
    await vi.waitFor(() => expect(document.body.querySelector('[role="dialog"]')).not.toBeNull());
    const dialog = TestBed.inject(MatDialog).openDialogs.at(-1);
    expect(dialog).toBeDefined();
    const controls = dialog?.componentInstance as unknown as {
      sortControl: FormControl<'UPDATED_ASC' | 'UPDATED_DESC' | 'CREATED_ASC' | 'CREATED_DESC'>;
    };
    controls.sortControl.setValue('CREATED_DESC');
    fixture.detectChanges();
    [...document.body.querySelectorAll('button')]
      .find((candidate) => candidate.textContent?.includes('Aplicar filtros'))
      ?.click();
    await vi.waitFor(() => expect(document.body.querySelector('[role="dialog"]')).toBeNull());
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('mat-card-title')?.textContent).toContain('Grace Hopper');
    expect(fixture.nativeElement.textContent).toContain('3 de 3');
  });

  it('routes ticket approval to purchase review and reports a stale queue result', async () => {
    const queue = createAdminReceiptValidationQueue({ items: [ticketItem] });
    const { fixture, api } = setup({ queue, approvalResult: false, refreshedQueue: queue });
    await settle(fixture);

    button(fixture, 'Aprovar comprovante')?.click();
    await vi.waitFor(() => expect(api.approveTicketPurchase).toHaveBeenCalledWith('purchase-1'));
    await settle(fixture);
    expect(api.approve).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('A compra não está mais aguardando validação. Atualize a fila.');
  });

  it('requires a ticket rejection reason and sends it to the purchase-review operation', async () => {
    const queue = createAdminReceiptValidationQueue({ items: [ticketItem] });
    const { fixture, api } = setup({ queue });
    await settle(fixture);

    button(fixture, 'Recusar comprovante')?.click();
    await settle(fixture);
    const reject = button(fixture, 'Recusar compra');
    expect(reject?.disabled).toBe(true);
    const reason = fixture.nativeElement.querySelector('.reject-panel textarea') as HTMLTextAreaElement;
    reason.value = '  Comprovante sem identificação do pagamento.  ';
    reason.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(reject?.disabled).toBe(false);
    reject?.click();
    await vi.waitFor(() => expect(api.rejectTicketPurchase).toHaveBeenCalledWith('purchase-1', 'Comprovante sem identificação do pagamento.'));
    expect(api.reject).not.toHaveBeenCalled();
  });

  it('leaves approval unavailable when a ticket purchase has no receipt file', async () => {
    const queue = createAdminReceiptValidationQueue({
      items: [createAdminReceiptValidationQueueItem({ ...ticketItem, receipt: null })],
    });
    const { fixture, api } = setup({ queue });
    await settle(fixture);

    expect(button(fixture, 'Aprovar comprovante')?.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Comprovante indisponível.');
    expect(api.approveTicketPurchase).not.toHaveBeenCalled();
  });
});
