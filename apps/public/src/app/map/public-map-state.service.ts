import { Injectable } from '@angular/core';
import { PublicMapFilters } from './public-map.models';

export interface StoredPublicMapState {
  center: [number, number];
  zoom: number;
  rotation: number;
  filters: PublicMapFilters;
}

@Injectable({ providedIn: 'root' })
export class PublicMapStateService {
  // Intentionally memory-only: a centered user location must not leak into
  // URLs, browser history, logs, or durable web storage.
  private state: StoredPublicMapState | null = null;

  read(): StoredPublicMapState | null {
    return this.state;
  }

  write(state: StoredPublicMapState): void {
    this.state = state;
  }
}
