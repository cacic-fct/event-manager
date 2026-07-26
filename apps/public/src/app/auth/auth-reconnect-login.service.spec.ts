import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '@cacic-fct/shared-angular';
import { Subject } from 'rxjs';
import { NetworkConnectionStatus, NetworkStatusService } from '../shared/network-status.service';
import { AuthReconnectLoginService } from './auth-reconnect-login.service';

describe('AuthReconnectLoginService', () => {
  let statuses: Subject<NetworkConnectionStatus>;
  const isAuthenticated = signal(false);
  const loginWithExistingSsoSession = vi.fn();
  let isOnline = false;

  beforeEach(() => {
    statuses = new Subject<NetworkConnectionStatus>();
    isAuthenticated.set(false);
    isOnline = false;
    loginWithExistingSsoSession.mockClear();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            isAuthenticated,
            loginWithExistingSsoSession,
          },
        },
        {
          provide: NetworkStatusService,
          useValue: {
            isOnline: () => isOnline,
            watchStatusChanges: () => statuses.asObservable(),
          },
        },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('silently attempts login when an unauthenticated offline user reconnects', () => {
    TestBed.inject(AuthReconnectLoginService).start();

    statuses.next('online');

    expect(loginWithExistingSsoSession).toHaveBeenCalledOnce();
  });

  it('does not attempt login when the user was already online or is authenticated', () => {
    isOnline = true;
    const service = TestBed.inject(AuthReconnectLoginService);
    service.start();
    statuses.next('online');

    isAuthenticated.set(true);
    statuses.next('offline');
    statuses.next('online');

    expect(loginWithExistingSsoSession).not.toHaveBeenCalled();
  });

  it('starts only one reconnection listener', () => {
    const service = TestBed.inject(AuthReconnectLoginService);
    service.start();
    service.start();
    statuses.next('online');

    expect(loginWithExistingSsoSession).toHaveBeenCalledOnce();
  });
});
