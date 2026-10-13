import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Permission } from '@cacic-fct/shared-permissions';
import type { TransferApplyRequest, TransferResult } from '@cacic-fct/shared-data-transfer';
import { of, Subject, throwError, type Observable } from 'rxjs';
import { routes } from '../app-shell/admin-shell.routes';
import { PermissionsService } from '../permissions/permissions.service';
import { DataTransferApiService } from './data-transfer-api.service';
import { DataTransferPageComponent } from './data-transfer-page.component';
import {
  createTransferPreviewFixture,
  createTransferResultFixture,
  transferDocumentFixture,
} from './data-transfer-page.fixtures';

@Component({ template: 'Destino' })
class TransferGuardDestinationComponent {}

describe('data transfer navigation guards', () => {
  const initialUrl = '/data-transfer/event/event-old';

  async function createHarness(applyResponse: Observable<TransferResult>, confirmDiscard = true) {
    const scopedRoute = routes
      .find((route) => route.path === '')
      ?.children?.find((route) => route.path === 'data-transfer/:kind/:targetId');
    if (!scopedRoute) throw new Error('The scoped data-transfer route is missing.');
    const api = {
      history: vi.fn(() => of([])),
      preview: vi.fn(() => of(createTransferPreviewFixture())),
      apply: vi.fn<(request: TransferApplyRequest) => Observable<TransferResult>>(() => applyResponse),
    };
    const dialog = { open: vi.fn(() => ({ afterClosed: () => of(confirmDiscard) })) };
    const permissions = new Set<string>([Permission.DataTransfer.Import, Permission.Event.Read]);

    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            ...scopedRoute,
            canMatch: [],
            loadComponent: undefined,
            component: DataTransferPageComponent,
          },
          { path: 'destination', component: TransferGuardDestinationComponent },
        ]),
        { provide: DataTransferApiService, useValue: api },
        { provide: PermissionsService, useValue: { has: (permission: string) => permissions.has(permission) } },
        { provide: MatDialog, useValue: dialog },
      ],
    })
      .overrideComponent(DataTransferPageComponent, {
        set: {
          imports: [],
          template: `
            <textarea [value]="jsonText()" (input)="onTextInput($event)"></textarea>
            <button type="button" (click)="previewImport()">Revisar</button>
            <button type="button" (click)="applyImport()">Aplicar</button>
            <button type="button" (click)="retryApply()">Verificar resultado</button>
          `,
        },
      })
      .compileComponents();

    const harness = await RouterTestingHarness.create(initialUrl);
    const component = harness.routeDebugElement?.componentInstance as DataTransferPageComponent;
    const canDeactivate = vi.spyOn(component, 'canDeactivate');
    const router = TestBed.inject(Router);

    function enterDocument(): void {
      const textarea = harness.routeNativeElement?.querySelector('textarea');
      if (!textarea) throw new Error('The import editor is missing.');
      textarea.value = JSON.stringify(transferDocumentFixture);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      harness.detectChanges();
    }

    function clickButton(label: string): void {
      const button = [...(harness.routeNativeElement?.querySelectorAll('button') ?? [])].find(
        (candidate) => candidate.textContent?.trim() === label,
      );
      if (!button) throw new Error(`Button ${label} is missing.`);
      button.click();
      harness.detectChanges();
    }

    return { harness, router, api, dialog, canDeactivate, enterDocument, clickButton };
  }

  it.each(['pending', 'uncertain'] as const)(
    'retains the current scope and request while the apply outcome is %s',
    async (outcome) => {
      const response = new Subject<TransferResult>();
      const applyResponse = outcome === 'pending' ? response : throwError(() => new HttpErrorResponse({ status: 0 }));
      const { harness, router, api, dialog, canDeactivate, enterDocument, clickButton } =
        await createHarness(applyResponse);
      enterDocument();
      clickButton('Revisar');
      await harness.fixture.whenStable();
      harness.detectChanges();
      clickButton('Aplicar');
      const originalRequest = api.apply.mock.calls[0][0];

      for (const destination of [
        '/data-transfer/event/event-new',
        '/data-transfer/group/group-new',
        `${initialUrl}?view=review`,
        '/destination',
      ]) {
        expect(await router.navigateByUrl(destination)).toBe(false);
        expect(router.url).toBe(initialUrl);
      }
      expect(canDeactivate).toHaveBeenCalledTimes(4);
      expect(dialog.open).not.toHaveBeenCalled();
      expect(api.apply).toHaveBeenCalledOnce();
      expect(originalRequest.scope).toEqual({ kind: 'event', id: 'event-old' });

      if (outcome === 'pending') {
        response.next(createTransferResultFixture());
        response.complete();
      } else {
        api.apply.mockReturnValueOnce(of(createTransferResultFixture()));
        clickButton('Verificar resultado');
        expect(api.apply.mock.calls[1][0]).toBe(originalRequest);
      }
      await harness.fixture.whenStable();
      harness.detectChanges();
      expect(await router.navigateByUrl('/data-transfer/event/event-new')).toBe(true);
      expect(router.url).toBe('/data-transfer/event/event-new');
    },
  );

  it('still allows an ordinary draft to be discarded before changing scope', async () => {
    const { harness, router, dialog, enterDocument } = await createHarness(of(createTransferResultFixture()));
    enterDocument();

    expect(await router.navigateByUrl('/data-transfer/event/event-new')).toBe(true);
    harness.detectChanges();
    expect(dialog.open).toHaveBeenCalledOnce();
    expect(harness.routeNativeElement?.querySelector('textarea')?.value).toBe('');
  });

  it('keeps the draft and current scope when the user declines to discard it', async () => {
    const { harness, router, dialog, enterDocument } = await createHarness(of(createTransferResultFixture()), false);
    enterDocument();

    expect(await router.navigateByUrl('/data-transfer/event/event-new')).toBe(false);
    harness.detectChanges();
    expect(router.url).toBe(initialUrl);
    expect(dialog.open).toHaveBeenCalledOnce();
    expect(harness.routeNativeElement?.querySelector('textarea')?.value).toBe(JSON.stringify(transferDocumentFixture));
  });
});
