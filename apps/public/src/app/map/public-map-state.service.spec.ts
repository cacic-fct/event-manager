import { TestBed } from '@angular/core/testing';
import { PublicMapStateService, StoredPublicMapState } from './public-map-state.service';

describe('PublicMapStateService', () => {
  it('keeps map view and filters in memory for navigation within the application', () => {
    const service = TestBed.inject(PublicMapStateService);
    const state: StoredPublicMapState = {
      center: [-51.40775, -22.12103],
      zoom: 17,
      rotation: 0.4,
      filters: { audience: 'MINE', date: 'TODAY' },
    };

    expect(service.read()).toBeNull();

    service.write(state);

    expect(service.read()).toBe(state);
  });

  it('does not persist state in browser storage', () => {
    const sessionSet = vi.spyOn(sessionStorage, 'setItem');
    const service = TestBed.inject(PublicMapStateService);

    service.write({
      center: [-51.4, -22.12],
      zoom: 19,
      rotation: 0,
      filters: { audience: 'ALL', date: 'ALL' },
    });

    expect(sessionSet).not.toHaveBeenCalled();
  });
});
