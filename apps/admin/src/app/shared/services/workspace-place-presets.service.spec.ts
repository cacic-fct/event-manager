import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { PlacePresetApiService } from '../../graphql/place-preset-api.service';
import { PlacePreset, PlacePresetInput } from '../../graphql/models';
import { WorkspacePlacePresetsService } from './workspace-place-presets.service';

describe('WorkspacePlacePresetsService', () => {
  let service: WorkspacePlacePresetsService;
  let api: {
    listPlacePresets: ReturnType<typeof vi.fn>;
    createPlacePreset: ReturnType<typeof vi.fn>;
    updatePlacePreset: ReturnType<typeof vi.fn>;
    deletePlacePreset: ReturnType<typeof vi.fn>;
    mergePlacePreset: ReturnType<typeof vi.fn>;
    getPlacePreset: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    api = {
      listPlacePresets: vi.fn(() => of([])),
      createPlacePreset: vi.fn((input: PlacePresetInput) => of(createPlacePreset({ ...input, id: 'created-place' }))),
      updatePlacePreset: vi.fn((id: string, input: PlacePresetInput) => of(createPlacePreset({ ...input, id }))),
      deletePlacePreset: vi.fn(() => of({ deleted: true, id: 'place-1' })),
      mergePlacePreset: vi.fn(() => of({ deleted: true, id: 'source-place' })),
      getPlacePreset: vi.fn(() => of(createPlacePreset({ id: 'place-1', name: 'Auditório' }))),
    };

    await TestBed.configureTestingModule({
      providers: [
        WorkspacePlacePresetsService,
        { provide: PlacePresetApiService, useValue: api },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    service = TestBed.inject(WorkspacePlacePresetsService);
  });

  it('sorts presets alphabetically for display', () => {
    service.placePresets.set([
      createPlacePreset({ id: 'b', name: 'Zeladoria' }),
      createPlacePreset({ id: 'a', name: 'Auditório' }),
    ]);

    expect(service.sortedPlacePresets().map((place) => place.name)).toEqual(['Auditório', 'Zeladoria']);
  });

  it('autosaves a manual location when no identical preset exists', async () => {
    service.placePresets.set([createPlacePreset({ id: 'existing', name: 'Laboratório' })]);

    await service.ensurePresetForManualLocation({
      name: 'Sala 5',
      latitude: -22.1,
      longitude: -49.2,
      locationDescription: 'Sala 5',
    });

    expect(api.createPlacePreset).toHaveBeenCalledWith({
      name: 'Sala 5',
      latitude: -22.1,
      longitude: -49.2,
      locationDescription: 'Sala 5',
    });
  });

  it('does not autosave duplicate manual locations', async () => {
    service.placePresets.set([
      createPlacePreset({
        id: 'existing',
        name: 'Sala 5',
        latitude: -22.1,
        longitude: -49.2,
        locationDescription: 'Sala 5',
      }),
    ]);

    await service.ensurePresetForManualLocation({
      name: 'sala 5',
      latitude: -22.1,
      longitude: -49.2,
      locationDescription: 'Sala 5',
    });

    expect(api.createPlacePreset).not.toHaveBeenCalled();
  });
});

function createPlacePreset(input: Partial<PlacePreset>): PlacePreset {
  return {
    id: input.id ?? 'place-1',
    name: input.name ?? 'Local',
    latitude: input.latitude,
    longitude: input.longitude,
    locationDescription: input.locationDescription,
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
  };
}
