import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './attendance.routes';

@Component({ template: '' })
class Destination {}

describe('legacy participation links', () => {
  it.each(['event', 'event-group', 'major-event'])(
    'redirects legacy %s links with their original ID and URL state',
    async (type) => {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([
            { path: 'profile/attendances', children: routes },
            { path: `${type}/:id`, component: Destination },
          ]),
        ],
      });
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(`/profile/attendances/${type}/id%2F1?returnUrl=%2Fcalendar#section`, Destination);
      expect(TestBed.inject(Router).url).toBe(`/${type}/id%2F1?returnUrl=%2Fcalendar#section`);
    },
  );
});
