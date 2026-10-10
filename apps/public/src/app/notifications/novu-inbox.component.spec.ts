import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router } from '@angular/router';
import type { Notification } from '@novu/js';
import { Subject, of } from 'rxjs';
import { NovuInboxComponent } from '@cacic-fct/shared-notifications-angular/inbox';
import { NovuNotificationsService } from '@cacic-fct/shared-notifications-angular/service';

describe('NovuInboxComponent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('completes external actions when noopener returns a null window handle', async () => {
    const { component, notifications } = await createFixture();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const notification = createNotification({
      primaryAction: { label: 'Abrir', isCompleted: false, redirect: { url: 'https://example.com/primary', target: '_blank' } },
      secondaryAction: { label: 'Consultar', isCompleted: false, redirect: { url: 'https://example.com/secondary', target: '_blank' } },
    });
    await inboxMethods(component).runPrimaryAction(notification);
    await inboxMethods(component).runSecondaryAction(notification);
    expect(open).toHaveBeenCalledWith('https://example.com/primary', '_blank', 'noopener,noreferrer');
    expect(open).toHaveBeenCalledWith('https://example.com/secondary', '_blank', 'noopener,noreferrer');
    expect(notifications.completePrimary).toHaveBeenCalledWith(notification);
    expect(notifications.completeSecondary).toHaveBeenCalledWith(notification);
    expect(inboxSignals(component).error()).toBeNull();
  });
  it('opens the contextual action when the notification body is activated', async () => {
    const { component, router } = await createFixture();
    const notification = createNotification({
      redirect: { url: '/profile/attendances' },
      primaryAction: {
        label: 'Enviar comprovante',
        isCompleted: false,
        redirect: { url: '/major-event/major-event-1/payment' },
      },
    });

    inboxMethods(component).activateNotification(new Event('click'), notification);

    expect(router.navigateByUrl).toHaveBeenCalledWith('/major-event/major-event-1/payment');
  });

  it('does not activate the row when an action button was clicked', async () => {
    const { component, router } = await createFixture();
    const button = document.createElement('button');
    const event = new Event('click');
    Object.defineProperty(event, 'target', { value: button });

    inboxMethods(component).activateNotification(
      event,
      createNotification({ redirect: { url: '/profile/attendances' } }),
    );

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('opens the action even when Novu cannot record its completion', async () => {
    const { component, notifications, router } = await createFixture();
    notifications.completePrimary.mockRejectedValueOnce(new Error('offline'));
    const notification = createNotification({
      primaryAction: { label: 'Responder', isCompleted: false, redirect: { url: '/profile/forms/form-1' } },
    });

    await inboxMethods(component).runPrimaryAction(notification);

    expect(router.navigateByUrl).toHaveBeenCalledWith('/profile/forms/form-1');
    expect(inboxSignals(component).error()).toBe('A notificação foi aberta, mas não foi possível registrar a ação.');
  });

  it('does not complete a primary action when its redirect is invalid', async () => {
    const { component, notifications, router } = await createFixture();
    const notification = createNotification({
      primaryAction: { label: 'Responder', isCompleted: false, redirect: { url: '//malicious.example' } },
    });

    await inboxMethods(component).runPrimaryAction(notification);

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(notifications.completePrimary).not.toHaveBeenCalled();
    expect(inboxSignals(component).error()).toBe('O link desta notificação é inválido.');
  });

  it('does not complete a primary action when internal navigation is rejected', async () => {
    const { component, notifications, router } = await createFixture();
    router.navigateByUrl.mockResolvedValueOnce(false);
    const notification = createNotification({
      primaryAction: { label: 'Responder', isCompleted: false, redirect: { url: '/profile/forms/form-1' } },
    });

    await inboxMethods(component).runPrimaryAction(notification);

    expect(router.navigateByUrl).toHaveBeenCalledWith('/profile/forms/form-1');
    expect(notifications.completePrimary).not.toHaveBeenCalled();
    expect(inboxSignals(component).error()).toBe('O link desta notificação não pôde ser aberto.');
  });

  it('completes a no-redirect secondary action without attempting navigation', async () => {
    const { component, notifications, router } = await createFixture();
    const notification = createNotification({
      secondaryAction: { label: 'Confirmar', isCompleted: false },
    });

    await inboxMethods(component).runSecondaryAction(notification);

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(notifications.completeSecondary).toHaveBeenCalledWith(notification);
  });

  it('reports the redirect outcome for a legitimate no-redirect action', async () => {
    const { component } = await createFixture();

    await expect(inboxMethods(component).openRedirect(createNotification({}))).resolves.toBe('none');
  });

  it('ignores a concurrent notification action while the first completion is pending', async () => {
    const { component, notifications, router } = await createFixture();
    let resolveCompletion: (() => void) | undefined;
    notifications.completePrimary.mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        resolveCompletion = resolve;
      }),
    );
    const firstNotification = createNotification({
      id: 'notification-1',
      primaryAction: { label: 'Responder', isCompleted: false, redirect: { url: '/first' } },
    });
    const secondNotification = createNotification({
      id: 'notification-2',
      primaryAction: { label: 'Responder', isCompleted: false, redirect: { url: '/second' } },
    });

    const firstAction = inboxMethods(component).runPrimaryAction(firstNotification);
    await Promise.resolve();
    await inboxMethods(component).runPrimaryAction(secondNotification);

    expect(notifications.completePrimary).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).toHaveBeenCalledTimes(1);
    expect(inboxSignals(component).saving()).toBe(true);

    resolveCompletion?.();
    await firstAction;
    expect(inboxSignals(component).saving()).toBe(false);
  });

  it('rejects protocol-relative notification redirects', async () => {
    const { component, router } = await createFixture();

    inboxMethods(component).openRedirect(createNotification({ redirect: { url: '//malicious.example' } }));

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});

async function createFixture(): Promise<{
  component: NovuInboxComponent;
  fixture: ComponentFixture<NovuInboxComponent>;
  notifications: ReturnType<typeof createNotificationsMock>;
  router: ReturnType<typeof createRouterMock>;
}> {
  const notifications = createNotificationsMock();
  const router = createRouterMock();

  await TestBed.configureTestingModule({
    imports: [NovuInboxComponent],
    providers: [
      provideNoopAnimations(),
      { provide: NovuNotificationsService, useValue: notifications },
      { provide: MatDialog, useValue: { open: vi.fn(() => ({ afterClosed: () => of(false) })) } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { pathFromRoot: [{ url: [] }, { url: [{ path: 'notifications' }] }] } },
      },
      { provide: Router, useValue: router },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(NovuInboxComponent);
  fixture.detectChanges();
  await fixture.whenStable();

  return { component: fixture.componentInstance, fixture, notifications, router };
}

function createNotificationsMock() {
  return {
    loadingConfig: signal(false),
    notificationPermission: signal<'granted'>('granted'),
    isConfigured: signal(true),
    client: signal(null),
    ensureReady: vi.fn(),
    shouldOfferPushPermission: vi.fn(() => false),
    archiveAllRead: vi.fn(),
    listNotificationPage: vi.fn().mockResolvedValue({ notifications: [], hasMore: false }),
    completePrimary: vi.fn().mockResolvedValue(undefined),
    completeSecondary: vi.fn().mockResolvedValue(undefined),
  };
}

function createRouterMock() {
  return {
    events: new Subject(),
    url: '/notifications',
    navigateByUrl: vi.fn(() => Promise.resolve(true)),
    parseUrl: vi.fn(() => ({ root: { children: { primary: { segments: [{ path: 'notifications' }] } } } })),
  };
}

function createNotification(overrides: Partial<Notification>): Notification {
  return {
    id: 'notification-1',
    createdAt: new Date().toISOString(),
    isRead: false,
    isArchived: false,
    ...overrides,
  } as Notification;
}

function inboxMethods(component: NovuInboxComponent) {
  return component as unknown as {
    activateNotification(event: Event, notification: Notification): void;
    openRedirect(notification: Notification): Promise<'opened' | 'failed' | 'invalid' | 'none'>;
    runPrimaryAction(notification: Notification): Promise<void>;
    runSecondaryAction(notification: Notification): Promise<void>;
  };
}

function inboxSignals(component: NovuInboxComponent) {
  return component as unknown as {
    error: ReturnType<typeof signal<string | null>>;
    saving: ReturnType<typeof signal<boolean>>;
  };
}
