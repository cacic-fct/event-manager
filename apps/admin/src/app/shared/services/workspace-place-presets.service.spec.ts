import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { PlacePresetApiService } from '../../graphql/place-preset-api.service';
import { PlacePresetInput } from '../../graphql/models';
import { createAdminPlacePreset } from '../../testing/admin-entity-fixtures';
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
      createPlacePreset: vi.fn((input: PlacePresetInput) =>
        of(createAdminPlacePreset({ ...input, id: 'created-place' })),
      ),
      updatePlacePreset: vi.fn((id: string, input: PlacePresetInput) => of(createAdminPlacePreset({ ...input, id }))),
      deletePlacePreset: vi.fn(() => of({ deleted: true, id: 'place-1' })),
      mergePlacePreset: vi.fn(() => of({ deleted: true, id: 'source-place' })),
      getPlacePreset: vi.fn(() => of(createAdminPlacePreset({ id: 'place-1', name: 'Auditório' }))),
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

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sorts presets alphabetically for display', () => {
    service.placePresets.set([
      createAdminPlacePreset({ id: 'b', name: 'Zeladoria' }),
      createAdminPlacePreset({ id: 'a', name: 'Auditório' }),
    ]);

    expect(service.sortedPlacePresets().map((place) => place.name)).toEqual(['Auditório', 'Zeladoria']);
  });

  it('loads matching presets as the search query changes', async () => {
    vi.useFakeTimers();
    api.listPlacePresets.mockReturnValueOnce(of([createAdminPlacePreset({ id: 'lab', name: 'Laboratório' })]));

    service.filterForm.controls.query.setValue('lab');

    await vi.advanceTimersByTimeAsync(250);

    expect(api.listPlacePresets).toHaveBeenCalledWith({ query: 'lab', skip: 0, take: 51 });
    expect(service.placePresets().map((place) => place.id)).toEqual(['lab']);
  });

  it('autosaves a manual location when no identical preset exists', async () => {
    service.placePresets.set([createAdminPlacePreset({ id: 'existing', name: 'Laboratório' })]);

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
      createAdminPlacePreset({
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
