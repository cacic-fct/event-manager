import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import { MajorEventApiService } from './major-event-api.service';

describe('MajorEventApiService', () => {
  let graphqlHttp: { request: ReturnType<typeof vi.fn> };
  let service: MajorEventApiService;

  beforeEach(() => {
    graphqlHttp = {
      request: vi.fn((query: string) => {
        if (query.includes('ListMajorEvents')) {
          return of({ majorEvents: [majorEventFixture()] });
        }
        if (query.includes('GetMajorEvent')) {
          return of({ majorEvent: majorEventFixture({ id: 'major-detail' }) });
        }
        if (query.includes('CreateMajorEvent')) {
          return of({ createMajorEvent: majorEventFixture({ id: 'created-major' }) });
        }
        if (query.includes('UpdateMajorEvent')) {
          return of({ updateMajorEvent: majorEventFixture({ id: 'updated-major' }) });
        }
        if (query.includes('CloneMajorEvent')) {
          return of({ cloneMajorEvent: majorEventFixture({ id: 'cloned-major' }) });
        }
        return of({ deleteMajorEvent: { deleted: true, id: 'major-1' } });
      }),
    };

    TestBed.configureTestingModule({
      providers: [MajorEventApiService, { provide: GraphqlHttpService, useValue: graphqlHttp }],
    });

    service = TestBed.inject(MajorEventApiService);
  });

  it('maps major-event query and mutation response fields', async () => {
    await expect(firstValueFrom(service.listMajorEvents({ query: 'Semana', take: 10 }))).resolves.toEqual([
      majorEventFixture(),
    ]);
    await expect(firstValueFrom(service.getMajorEvent('major-detail'))).resolves.toEqual(
      majorEventFixture({ id: 'major-detail' }),
    );
    await expect(firstValueFrom(service.createMajorEvent({ name: 'Novo grande evento' } as never))).resolves.toEqual(
      majorEventFixture({ id: 'created-major' }),
    );
    await expect(firstValueFrom(service.updateMajorEvent('major-1', { name: 'Editado' } as never))).resolves.toEqual(
      majorEventFixture({ id: 'updated-major' }),
    );
    await expect(firstValueFrom(service.cloneMajorEvent('major-1', { name: 'Clone' } as never))).resolves.toEqual(
      majorEventFixture({ id: 'cloned-major' }),
    );
    await expect(firstValueFrom(service.deleteMajorEvent('major-1'))).resolves.toEqual({
      deleted: true,
      id: 'major-1',
    });

    expect(graphqlHttp.request).toHaveBeenNthCalledWith(1, expect.stringContaining('ListMajorEvents'), {
      query: 'Semana',
      take: 10,
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(4, expect.stringContaining('UpdateMajorEvent'), {
      id: 'major-1',
      input: { name: 'Editado' },
    });
  });
});

function majorEventFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'major-1',
    name: 'Semana da Computacao',
    startDate: '2026-07-01T09:00:00.000Z',
    endDate: '2026-07-05T18:00:00.000Z',
    createdAt: '2026-06-01T12:00:00.000Z',
    ...overrides,
  };
}
