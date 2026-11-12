import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { NovuNotificationsService } from '@cacic-fct/shared-notifications-angular/service';
import { NovuInboxComponent } from '@cacic-fct/shared-notifications-angular/inbox';
import { By } from '@angular/platform-browser';
import { NotificationsPageComponent } from './notifications-page.component';

describe('Admin notification review', () => {
  it('marks notifications as read once the inbox connects and supports the unread filter', async () => {
    const client = signal<object | null>(null);
    const notifications = {
      loadingConfig: signal(false),
      notificationPermission: signal('granted'),
      isConfigured: signal(true),
      client,
      ensureReady: vi.fn(),
      shouldOfferPushPermission: () => false,
      listNotificationPage: vi.fn().mockResolvedValue({ notifications: [], hasMore: false }),
      markAllAsRead: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      imports: [NotificationsPageComponent],
      providers: [
        provideRouter([]),
        { provide: NovuNotificationsService, useValue: notifications },
        { provide: MatDialog, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(NotificationsPageComponent);
    await fixture.whenStable();
    expect(notifications.markAllAsRead).not.toHaveBeenCalled();
    client.set({});
    await fixture.whenStable();
    expect(notifications.markAllAsRead).toHaveBeenCalledTimes(1);
    expect(notifications.listNotificationPage).toHaveBeenLastCalledWith({ archived: false });
    const child = fixture.debugElement.query(By.directive(NovuInboxComponent)).componentInstance as NovuInboxComponent;
    const actions = child as unknown as {
      selectIndex(index: number): void;
      markAllAsRead(): Promise<void>;
      error(): string | null;
    };
    actions.selectIndex(1);
    await fixture.whenStable();
    expect(notifications.listNotificationPage).toHaveBeenLastCalledWith({ archived: false, read: false });
    await actions.markAllAsRead();
    expect(notifications.markAllAsRead).toHaveBeenCalledTimes(2);
    notifications.markAllAsRead.mockRejectedValueOnce(new Error('offline'));
    await actions.markAllAsRead();
    expect(actions.error()).toContain('Tente novamente');
  });
});
