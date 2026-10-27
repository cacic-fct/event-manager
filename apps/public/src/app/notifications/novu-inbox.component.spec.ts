import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router } from '@angular/router';
import type { ChannelPreference, Notification, Novu, Preference } from '@novu/js';
import { Subject, of } from 'rxjs';
import { NovuInboxComponent } from '@cacic-fct/shared-notifications-angular/inbox';
import { NovuNotificationsService } from '@cacic-fct/shared-notifications-angular/service';

describe('NovuInboxComponent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('groups and sorts optional workflows while excluding required messages', async () => {
    const { component, fixture, notifications } = await createFixture();
    notifications.listPreferences.mockResolvedValue([
      createPreference('event-form-available'),
      createPreference('offline-attendance-review-queued'),
      createPreference('online-attendance-available'),
      createPreference('audience-invitation'),
      createPreference(),
    ]);

    inboxMethods(component).selectIndex(2);
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect([...root.querySelectorAll('h3')].map((heading) => heading.textContent)).toEqual(['Canais', 'Eventos']);
    expect([...root.querySelectorAll('h4')].map((heading) => heading.textContent)).toEqual([
      'Avisos opcionais',
      'Formulários',
      'Presença online',
    ]);
    expect(root.querySelectorAll('mat-slide-toggle')).toHaveLength(6);
  });

  it.each([
    'offline-attendance-review-queued',
    'audience-invitation',
    'major-event-subscription-status-changed',
    'ticket-transfer',
    'event-subscriber-information',
  ])('rejects changes to the required %s workflow', async (identifier) => {
    const { component, notifications } = await createFixture();
    await inboxMethods(component).updatePreferenceChannel(createPreference(identifier), 'push', false);
    expect(notifications.updatePreferenceChannels).not.toHaveBeenCalled();
  });

  it('honors Novu critical metadata for a newly introduced workflow', async () => {
    const { component, fixture, notifications } = await createFixture();
    const preference = createPreference('new-critical-workflow', { critical: true, name: 'Aviso essencial' });
    notifications.listPreferences.mockResolvedValue([preference]);
    inboxMethods(component).selectIndex(2);
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Nenhuma preferência disponível para sua conta.',
    );
    expect((fixture.nativeElement as HTMLElement).querySelector('mat-slide-toggle')).toBeNull();
    await inboxMethods(component).updatePreferenceChannel(preference, 'in_app', false);
    expect(notifications.updatePreferenceChannels).not.toHaveBeenCalled();
  });

  it('disables globally paused channels without discarding individual preferences', async () => {
    const { component, fixture, notifications } = await createFixture();
    const global = createPreference(undefined, { channels: { in_app: true, push: false } });
    const certificate = createPreference('certificate-available');
    notifications.listPreferences.mockResolvedValue([global, certificate]);
    inboxMethods(component).selectIndex(2);
    await fixture.whenStable();
    fixture.detectChanges();
    const toggle = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Certificados: no navegador"]',
    );
    expect(toggle?.disabled).toBe(true);
    expect(toggle?.getAttribute('aria-checked')).toBe('false');
    expect(certificate.channels.push).toBe(true);
    await inboxMethods(component).updatePreferenceChannel(certificate, 'push', false);
    expect(notifications.updatePreferenceChannels).not.toHaveBeenCalled();
  });

  it('preserves other channel values and reports a failed save', async () => {
    const { component, fixture, notifications } = await createFixture();
    const preference = createPreference('certificate-available', {
      channels: { in_app: true, push: true, email: false },
    });
    notifications.updatePreferenceChannels.mockRejectedValueOnce(new Error('offline'));
    await inboxMethods(component).updatePreferenceChannel(preference, 'push', false);
    expect(notifications.updatePreferenceChannels).toHaveBeenCalledWith(preference, {
      in_app: true,
      push: false,
      email: false,
    });
    expect(preference.channels.push).toBe(true);
    expect(inboxSignals(component).error()).toBe('Não foi possível salvar a preferência. Tente novamente.');
    expect(inboxSignals(component).saving()).toBe(false);
    fixture.detectChanges();
  });

  it('keeps unknown optional workflows available and omits unsupported channel controls', async () => {
    const { component, fixture, notifications } = await createFixture();
    notifications.listPreferences.mockResolvedValue([
      createPreference('future-workflow', { name: 'Novo aviso', channels: { in_app: true } }),
    ]);
    inboxMethods(component).selectIndex(2);
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('h3')?.textContent).toBe('Outros avisos');
    expect(root.querySelector('h4')?.textContent).toBe('Novo aviso');
    expect(root.querySelectorAll('mat-slide-toggle')).toHaveLength(1);
    expect(root.querySelector('button[role="switch"]')?.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('completes external actions when noopener returns a null window handle', async () => {
    const { component, notifications } = await createFixture();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const notification = createNotification({
      primaryAction: {
        label: 'Abrir',
        isCompleted: false,
        redirect: { url: 'https://example.com/primary', target: '_blank' },
      },
      secondaryAction: {
        label: 'Consultar',
        isCompleted: false,
        redirect: { url: 'https://example.com/secondary', target: '_blank' },
      },
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
      () =>
        new Promise<void>((resolve) => {
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

describe('Novu notification preferences service', () => {
  beforeEach(() => vi.stubGlobal('localStorage', { getItem: vi.fn(() => null) }));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function createService() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        NovuNotificationsService,
        { provide: AuthService, useValue: { user: signal(null) } },
      ],
    });
    return TestBed.inject(NovuNotificationsService);
  }

  it('keeps the SDK default that excludes critical workflows', async () => {
    const service = createService();
    const preferences = [createPreference('certificate-available')];
    const list = vi.fn().mockResolvedValue({ data: preferences });
    vi.spyOn(service, 'client').mockReturnValue({ preferences: { list } } as unknown as Novu);
    expect(await service.listPreferences()).toEqual(preferences);
    expect(list).toHaveBeenCalledWith();
  });

  it('blocks mandatory preference writes even when the component is bypassed', async () => {
    const service = createService();
    const update = vi.fn();
    const required = Object.assign(createPreference('ticket-transfer'), { update });
    const serverCritical = Object.assign(createPreference('future-critical', { critical: true }), { update });
    await expect(service.updatePreferenceChannels(required, { push: false })).rejects.toThrow('Required notification');
    await expect(service.updatePreferenceChannels(serverCritical, { push: false })).rejects.toThrow(
      'Required notification',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('passes optional preference changes to Novu and propagates save errors', async () => {
    const service = createService();
    const update = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ error: new Error('offline') });
    const preference = Object.assign(createPreference('certificate-available'), { update });
    await service.updatePreferenceChannels(preference, { in_app: true, push: false });
    expect(update).toHaveBeenCalledWith({ channels: { in_app: true, push: false } });
    await expect(service.updatePreferenceChannels(preference, { push: false })).rejects.toThrow('offline');
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
    listPreferences: vi.fn<() => Promise<Preference[]>>().mockResolvedValue([]),
    updatePreferenceChannels: vi.fn().mockResolvedValue(undefined),
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
    selectIndex(index: number): void;
    updatePreferenceChannel(preference: Preference, channel: 'in_app' | 'push', enabled: boolean): Promise<void>;
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

function createPreference(
  identifier?: string,
  options: { critical?: boolean; name?: string; channels?: ChannelPreference } = {},
): Preference {
  return {
    level: identifier ? 'template' : 'global',
    enabled: true,
    channels: options.channels ?? { in_app: true, push: true },
    workflow: identifier
      ? { id: identifier, identifier, name: options.name ?? identifier, critical: options.critical ?? false }
      : undefined,
  } as Preference;
}
