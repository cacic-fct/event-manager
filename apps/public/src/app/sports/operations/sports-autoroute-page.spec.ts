import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors';
import { Subject, of, throwError } from 'rxjs';
import { SportsOperationsApiService } from './sports-operations-api.service';
import { SportsAutoroutePage } from './sports-autoroute-page';
import { ForbiddenGraphqlError } from '../../shared/rate-limit-error';

describe('SportsAutoroutePage', () => {
  let autoroute: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  let routeErrors: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    autoroute = vi.fn(() => of({ matchId: 'match-check-in', mode: 'CHECK_IN' }));
    navigate = vi.fn(() => Promise.resolve(true));
    routeErrors = { navigate: vi.fn(() => Promise.resolve(true)) };
    TestBed.configureTestingModule({
      providers: [
        { provide: SportsOperationsApiService, useValue: { autoroute } },
        { provide: Router, useValue: { navigate } },
        { provide: RouteErrorService, useValue: routeErrors },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('redirects a one-shot check-in autoroute to the operation page with its mode', () => {
    const page = createPage();

    page.ngOnInit();

    expect(autoroute).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/sports/operate', 'match-check-in'], {
      queryParams: { mode: 'CHECK_IN' },
    });
    expect(page.loading()).toBe(false);
    expect(routeErrors.navigate).not.toHaveBeenCalled();
  });

  it('shows shared 403 when the current-user sports route is denied', () => {
    autoroute.mockReturnValueOnce(throwError(() => new ForbiddenGraphqlError('forbidden')));
    const page = createPage();

    page.ngOnInit();

    expect(routeErrors.navigate).toHaveBeenCalledWith(403);
  });

  it('ignores a stale autoroute response after a newer one has redirected', () => {
    const staleResponse = new Subject<{ matchId: string; mode: string }>();
    autoroute.mockReset();
    autoroute.mockReturnValueOnce(staleResponse).mockReturnValueOnce(of({ matchId: 'match-new', mode: 'OPERATE' }));
    const page = createPage();

    page.load();
    page.load();
    staleResponse.next({ matchId: 'match-old', mode: 'CHECK_IN' });

    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/sports/operate', 'match-new'], {
      queryParams: { mode: 'OPERATE' },
    });
  });
});

function createPage(): SportsAutoroutePage {
  return TestBed.runInInjectionContext(() => new SportsAutoroutePage());
}
