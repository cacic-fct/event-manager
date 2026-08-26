import { Service, inject } from '@angular/core';
import {
  PrizeDraw,
  PrizeDrawEligibleEntry,
  PrizeDrawSpinResult,
  PrizeDrawWinnerContact,
  SavePrizeDrawInput,
  SpinPrizeDrawInput,
} from '@cacic-fct/event-manager-admin-contracts';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';

const PRIZE_DRAW_FIELDS = `
  id
  title
  description
  target {
    type
    id
    name
  }
  includePresent
  includeSubscribers
  includeManualEntries
  chanceMode
  spinLimit
  removeWinnerAfterDraw
  defaultSpeed
  dramaticCountdownSeconds
  notifyWinner
  frozenAt
  unfrozenAt
  revision
  plannedSpins {
    id
    position
    description
    speed
    countdownSeconds
  }
  manualEntries {
    id
    personId
    name
    weight
  }
  weightOverrides {
    personId
    weight
  }
  excludedPeople {
    personId
    displayName
  }
  spins {
    id
    sequence
    plannedSpinId
    description
    speed
    countdownSeconds
    chanceMode
    removeWinnerAfterDraw
    winnerDisplayName
    winnerPersonId
    winnerWeight
    entrantCount
    totalWeight
    duplicateEntryCount
    weightBreakdown {
      weight
      peopleCount
    }
    eligibilityFrozenAt
    drawnAt
    undoneAt
    notificationStatus
  }
  eligibleEntrantCount
  eligibleTotalWeight
  eligibleDuplicateEntryCount
  createdAt
  updatedAt
`;

@Service()
export class PrizeDrawApiService {
  private readonly graphql = inject(GraphqlHttpService);

  list() {
    return this.graphql
      .request<{ prizeDraws: PrizeDraw[] }>(`query PrizeDraws { prizeDraws { ${PRIZE_DRAW_FIELDS} } }`)
      .pipe(map((data) => data.prizeDraws));
  }

  get(drawId: string) {
    return this.graphql
      .request<{
        prizeDraw: PrizeDraw;
      }>(`query PrizeDraw($drawId: String!) { prizeDraw(drawId: $drawId) { ${PRIZE_DRAW_FIELDS} } }`, { drawId })
      .pipe(map((data) => data.prizeDraw));
  }

  save(input: SavePrizeDrawInput) {
    return this.graphql
      .request<{ savePrizeDraw: PrizeDraw }>(
        `mutation SavePrizeDraw($input: SavePrizeDrawInput!) {
          savePrizeDraw(input: $input) { ${PRIZE_DRAW_FIELDS} }
        }`,
        { input },
      )
      .pipe(map((data) => data.savePrizeDraw));
  }

  eligibleEntries(drawId: string) {
    return this.graphql
      .request<{ prizeDrawEligibleEntries: PrizeDrawEligibleEntry[] }>(
        `query PrizeDrawEligibleEntries($drawId: String!) {
          prizeDrawEligibleEntries(drawId: $drawId) {
            identityKey
            personId
            displayName
            weight
            sources
          }
        }`,
        { drawId },
      )
      .pipe(map((data) => data.prizeDrawEligibleEntries));
  }

  freeze(drawId: string) {
    return this.drawMutation('freezePrizeDrawEligibility', drawId);
  }

  unfreeze(drawId: string) {
    return this.drawMutation('unfreezePrizeDrawEligibility', drawId);
  }

  undoLast(drawId: string) {
    return this.drawMutation('undoLastPrizeDrawSpin', drawId);
  }

  spin(input: SpinPrizeDrawInput) {
    return this.graphql
      .request<{ spinPrizeDraw: PrizeDrawSpinResult }>(
        `mutation SpinPrizeDraw($input: SpinPrizeDrawInput!) {
          spinPrizeDraw(input: $input) {
            demo
            drawId
            spinId
            sequence
            drawTitle
            spinDescription
            winnerFullName
            winnerReelName
            winnerReelIndex
            reelNames
            speed
            countdownMs
            reelDurationMs
            preRevealPauseMs
            hasMoreSpins
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.spinPrizeDraw));
  }

  winnerContact(spinId: string) {
    return this.graphql
      .request<{ prizeDrawWinnerContact: PrizeDrawWinnerContact }>(
        `query PrizeDrawWinnerContact($spinId: String!) {
          prizeDrawWinnerContact(spinId: $spinId) {
            spinId
            fullName
            email
            phone
            academicId
          }
        }`,
        { spinId },
      )
      .pipe(map((data) => data.prizeDrawWinnerContact));
  }

  private drawMutation(name: string, drawId: string) {
    return this.graphql
      .request<
        Record<string, PrizeDraw>
      >(`mutation PrizeDrawAction($drawId: String!) { ${name}(drawId: $drawId) { ${PRIZE_DRAW_FIELDS} } }`, { drawId })
      .pipe(map((data) => data[name]));
  }
}
