import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import { DeletionResult, PlacePreset, PlacePresetInput } from '@cacic-fct/event-manager-admin-contracts';
import { PLACE_PRESET_FIELDS } from './graphql-query-fragments';

@Injectable({ providedIn: 'root' })
export class PlacePresetApiService {
  private readonly graphqlHttp = inject(GraphqlHttpService);

  listPlacePresets(filters?: { query?: string; skip?: number; take?: number }) {
    return this.graphqlHttp
      .request<{ placePresets: PlacePreset[] }>(
        `query ListPlacePresets($query: String, $skip: Int, $take: Int) {
          placePresets(query: $query, skip: $skip, take: $take) {
            ${PLACE_PRESET_FIELDS}
          }
        }`,
        filters,
      )
      .pipe(map((data) => data.placePresets));
  }

  getPlacePreset(id: string) {
    return this.graphqlHttp
      .request<{ placePreset: PlacePreset }>(
        `query GetPlacePreset($id: String!) {
          placePreset(id: $id) {
            ${PLACE_PRESET_FIELDS}
          }
        }`,
        { id },
      )
      .pipe(map((data) => data.placePreset));
  }

  createPlacePreset(input: PlacePresetInput) {
    return this.graphqlHttp
      .request<{ createPlacePreset: PlacePreset }>(
        `mutation CreatePlacePreset($input: PlacePresetCreateInput!) {
          createPlacePreset(input: $input) {
            ${PLACE_PRESET_FIELDS}
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.createPlacePreset));
  }

  updatePlacePreset(id: string, input: PlacePresetInput) {
    return this.graphqlHttp
      .request<{ updatePlacePreset: PlacePreset }>(
        `mutation UpdatePlacePreset($id: String!, $input: PlacePresetUpdateInput!) {
          updatePlacePreset(id: $id, input: $input) {
            ${PLACE_PRESET_FIELDS}
          }
        }`,
        { id, input },
      )
      .pipe(map((data) => data.updatePlacePreset));
  }

  deletePlacePreset(id: string) {
    return this.graphqlHttp
      .request<{ deletePlacePreset: DeletionResult }>(
        `mutation DeletePlacePreset($id: String!) {
          deletePlacePreset(id: $id) {
            deleted
            id
          }
        }`,
        { id },
      )
      .pipe(map((data) => data.deletePlacePreset));
  }

  mergePlacePreset(targetId: string, sourceId: string, input: PlacePresetInput) {
    return this.graphqlHttp
      .request<{ mergePlacePreset: DeletionResult }>(
        `mutation MergePlacePreset($targetId: String!, $sourceId: String!, $input: PlacePresetUpdateInput!) {
          mergePlacePreset(targetId: $targetId, sourceId: $sourceId, input: $input) {
            deleted
            id
          }
        }`,
        { targetId, sourceId, input },
      )
      .pipe(map((data) => data.mergePlacePreset));
  }
}
