import { convertToParamMap } from '@angular/router';
import { Subject } from 'rxjs';
import type { OrganizerInfo } from '../attendances-api.service';
import { OrganizerInfoComponent } from './organizer-info';

describe('OrganizerInfoComponent', () => {
  it('does not preserve ready data from a previous target when the next target fails', () => {
    const first = new Subject<OrganizerInfo | null>();
    const second = new Subject<OrganizerInfo | null>();
    const api = { getOrganizerInfoStrict: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second) };
    const component = Object.create(OrganizerInfoComponent.prototype) as unknown as {
      api: typeof api;
      loadedOrganizerTarget: string | null;
      loadOrganizerInfo(params: ReturnType<typeof convertToParamMap>): Subject<unknown>;
    };
    component.api = api;
    component.loadedOrganizerTarget = null;
    const states: unknown[] = [];

    component
      .loadOrganizerInfo(convertToParamMap({ eventType: 'event', eventId: 'event-a' }))
      .subscribe((state) => states.push(state));
    const firstInfo = { targetType: 'EVENT', targetId: 'event-a' } as unknown as OrganizerInfo;
    first.next(firstInfo);
    component
      .loadOrganizerInfo(convertToParamMap({ eventType: 'event', eventId: 'event-b' }))
      .subscribe((state) => states.push(state));
    second.error(new Error('Falha ao carregar B'));

    expect(states).toEqual([
      { status: 'ready', info: firstInfo },
      { status: 'error', message: 'Falha ao carregar B' },
    ]);
  });
});
