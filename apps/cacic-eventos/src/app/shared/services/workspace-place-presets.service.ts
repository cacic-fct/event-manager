import { Injectable, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PlacePresetApiService } from '../../graphql/place-preset-api.service';
import { PlacePreset, PlacePresetInput } from '../../graphql/models';
import {
  PlacePresetMergeDialogComponent,
  PlacePresetMergeDialogResult,
} from '../../workspace/dialogs/place-preset-merge-dialog.component';

@Injectable({
  providedIn: 'root',
})
export class WorkspacePlacePresetsService {
  private readonly api = inject(PlacePresetApiService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly snackbar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  readonly placePresets = signal<PlacePreset[]>([]);
  readonly selectedPlacePreset = signal<PlacePreset | null>(null);
  readonly mergeSource = signal<PlacePreset | null>(null);
  readonly sortedPlacePresets = computed(() =>
    [...this.placePresets()].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')),
  );

  readonly filterForm = this.formBuilder.nonNullable.group({
    query: [''],
  });

  readonly placeForm = this.formBuilder.nonNullable.group({
    id: [''],
    name: ['', [Validators.required]],
    latitude: [''],
    longitude: [''],
    locationDescription: [''],
  });

  async loadPlacePresets(): Promise<void> {
    const query = this.filterForm.controls.query.value.trim();
    this.placePresets.set(await firstValueFrom(this.api.listPlacePresets({ query: query || undefined, take: 300 })));
  }

  async resetFilters(): Promise<void> {
    this.filterForm.reset({ query: '' });
    await this.loadPlacePresets();
  }

  startNewPlacePreset(): void {
    void this.router.navigate(['/places']);
    this.selectedPlacePreset.set(null);
    this.placeForm.reset({
      id: '',
      name: '',
      latitude: '',
      longitude: '',
      locationDescription: '',
    });
  }

  async pickPlacePreset(place: PlacePreset): Promise<void> {
    void this.router.navigate(['/places', place.id]);
    this.populatePlacePreset(place);
  }

  async pickPlacePresetById(placeId: string): Promise<void> {
    if (this.selectedPlacePreset()?.id === placeId) {
      return;
    }

    this.populatePlacePreset(await firstValueFrom(this.api.getPlacePreset(placeId)));
  }

  async savePlacePreset(): Promise<void> {
    if (this.placeForm.invalid) {
      this.placeForm.markAllAsTouched();
      return;
    }

    const raw = this.placeForm.getRawValue();
    const payload = this.buildPlacePresetPayload();
    if (raw.id) {
      await firstValueFrom(this.api.updatePlacePreset(raw.id, payload));
      this.snackbar.open('Local atualizado.', 'Fechar', { duration: 2500 });
    } else {
      await firstValueFrom(this.api.createPlacePreset(payload));
      this.snackbar.open('Local criado.', 'Fechar', { duration: 2500 });
    }
    await this.loadPlacePresets();
    this.startNewPlacePreset();
  }

  async deletePlacePreset(place: PlacePreset): Promise<void> {
    await firstValueFrom(this.api.deletePlacePreset(place.id));
    this.snackbar.open('Local excluído.', 'Fechar', { duration: 2500 });
    if (this.selectedPlacePreset()?.id === place.id) {
      this.startNewPlacePreset();
    }
    await this.loadPlacePresets();
  }

  chooseMergeSource(place: PlacePreset): void {
    this.mergeSource.set(place);
  }

  async openMergeDialog(target: PlacePreset): Promise<void> {
    const source = this.mergeSource();
    if (!source || source.id === target.id) {
      this.snackbar.open('Selecione outro local duplicado primeiro.', 'Fechar', { duration: 2500 });
      return;
    }

    const result = await firstValueFrom(
      this.dialog
        .open<PlacePresetMergeDialogComponent, { target: PlacePreset; source: PlacePreset }, PlacePresetMergeDialogResult>(
          PlacePresetMergeDialogComponent,
          {
            data: { target, source },
            width: '52rem',
            maxWidth: '95vw',
          },
        )
        .afterClosed(),
    );

    if (!result) {
      return;
    }

    await firstValueFrom(this.api.mergePlacePreset(result.targetId, result.sourceId, result.place));
    this.snackbar.open('Locais unificados.', 'Fechar', { duration: 2500 });
    this.mergeSource.set(null);
    await this.loadPlacePresets();
    this.startNewPlacePreset();
  }

  async ensurePresetForManualLocation(input: PlacePresetInput): Promise<void> {
    const name = input.name?.trim();
    if (!name) {
      return;
    }

    const latitude = input.latitude ?? null;
    const longitude = input.longitude ?? null;
    const locationDescription = input.locationDescription?.trim() || null;
    const existing = this.placePresets().find((place) => this.samePlace(place, name, latitude, longitude, locationDescription));

    if (existing) {
      return;
    }

    await firstValueFrom(
      this.api.createPlacePreset({
        name,
        latitude,
        longitude,
        locationDescription,
      }),
    );
    await this.loadPlacePresets();
  }

  private populatePlacePreset(place: PlacePreset): void {
    this.selectedPlacePreset.set(place);
    this.placeForm.reset({
      id: place.id,
      name: place.name,
      latitude: place.latitude?.toString() ?? '',
      longitude: place.longitude?.toString() ?? '',
      locationDescription: place.locationDescription ?? '',
    });
  }

  private buildPlacePresetPayload(): PlacePresetInput {
    const raw = this.placeForm.getRawValue();
    return {
      name: raw.name.trim(),
      latitude: raw.latitude ? Number(raw.latitude) : null,
      longitude: raw.longitude ? Number(raw.longitude) : null,
      locationDescription: raw.locationDescription.trim() || null,
    };
  }

  private samePlace(
    place: PlacePreset,
    name: string,
    latitude: number | null,
    longitude: number | null,
    locationDescription: string | null,
  ): boolean {
    return (
      place.name.trim().toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR') &&
      (place.latitude ?? null) === latitude &&
      (place.longitude ?? null) === longitude &&
      (place.locationDescription?.trim() || null) === locationDescription
    );
  }
}
