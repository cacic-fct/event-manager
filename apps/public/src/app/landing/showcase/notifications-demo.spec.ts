import { TestBed } from '@angular/core/testing';
import { NotificationsDemoComponent } from './notifications-demo';

describe('NotificationsDemoComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [NotificationsDemoComponent] }).compileComponents();
  });

  it('opens the targeted preview and removes that notification from the unread filter', () => {
    const fixture = TestBed.createComponent(NotificationsDemoComponent);
    const component = fixture.componentInstance;
    const open = vi.fn();
    component.openDestination.subscribe(open);
    component.unreadOnly.set(true);
    const notification = component.visibleNotifications().find((item) => item.destination === 'ticket-transfer');
    if (!notification) throw new Error('Expected a ticket notification');
    component.openNotification(notification);

    expect(open).toHaveBeenCalledWith('ticket-transfer');
    expect(component.unreadCount()).toBe(2);
    expect(component.visibleNotifications().some((item) => item.id === notification.id)).toBe(false);
  });
});
