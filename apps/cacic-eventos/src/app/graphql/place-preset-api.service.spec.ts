import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import { PlacePresetApiService } from './place-preset-api.service';

describe('PlacePresetApiService', () => {
  let graphqlHttp: { request: ReturnType<typeof vi.fn> };
  let service: PlacePresetApiService;

  beforeEach(() => {
    graphqlHttp = {
      request: vi.fn((query: string) => {
        if (query.includes('ListPlacePresets')) {
          return of({ placePresets: [placePresetFixture()] });
        }
        if (query.includes('GetPlacePreset')) {
          return of({ placePreset: placePresetFixture({ id: 'place-2' }) });
        }
        if (query.includes('CreatePlacePreset')) {
          return of({ createPlacePreset: placePresetFixture({ id: 'created-place' }) });
        }
        if (query.includes('UpdatePlacePreset')) {
          return of({ updatePlacePreset: placePresetFixture({ id: 'updated-place' }) });
        }
        if (query.includes('DeletePlacePreset')) {
          return of({ deletePlacePreset: { deleted: true, id: 'place-1' } });
        }
        return of({ mergePlacePreset: { deleted: true, id: 'source-place' } });
      }),
    };

    TestBed.configureTestingModule({
      providers: [PlacePresetApiService, { provide: GraphqlHttpService, useValue: graphqlHttp }],
    });

    service = TestBed.inject(PlacePresetApiService);
  });

  it('maps list and get operations from GraphQL response fields', async () => {
    await expect(firstValueFrom(service.listPlacePresets({ query: 'lab', take: 10 }))).resolves.toEqual([
      placePresetFixture(),
    ]);
    await expect(firstValueFrom(service.getPlacePreset('place-2'))).resolves.toEqual(placePresetFixture({ id: 'place-2' }));

    expect(graphqlHttp.request).toHaveBeenNthCalledWith(1, expect.stringContaining('ListPlacePresets'), {
      query: 'lab',
      take: 10,
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(2, expect.stringContaining('GetPlacePreset'), { id: 'place-2' });
  });

  it('maps create, update, delete, and merge mutations', async () => {
    const input = { name: 'Laboratorio 1', latitude: -22.1, longitude: -51.4, description: 'Bloco B' };

    await expect(firstValueFrom(service.createPlacePreset(input))).resolves.toEqual(
      placePresetFixture({ id: 'created-place' }),
    );
    await expect(firstValueFrom(service.updatePlacePreset('place-1', input))).resolves.toEqual(
      placePresetFixture({ id: 'updated-place' }),
    );
    await expect(firstValueFrom(service.deletePlacePreset('place-1'))).resolves.toEqual({ deleted: true, id: 'place-1' });
    await expect(firstValueFrom(service.mergePlacePreset('target-place', 'source-place', input))).resolves.toEqual({
      deleted: true,
      id: 'source-place',
    });
  });
});

function placePresetFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'place-1',
    name: 'Laboratorio',
    description: 'Bloco B',
    latitude: -22.1,
    longitude: -51.4,
    createdAt: '2026-05-21T12:00:00.000Z',
    updatedAt: '2026-05-21T12:00:00.000Z',
    ...overrides,
  };
}
