import { CurrencyPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import type {
  PublicEvent,
  PublicMajorEvent,
  PublicMajorEventPriceTier,
} from '@cacic-fct/event-manager-public-contracts';
import {
  automaticSelectionLimitViolations,
  selectableEventIds,
  subscriptionTierRuleSummaries,
} from './subscription-tier-policy';

@Component({
  selector: 'app-subscription-tier-selection',
  imports: [CurrencyPipe, MatButtonModule, MatIconModule, MatRadioModule],
  templateUrl: './tier-selection.html',
  styleUrl: './tier-selection.css',
})
export class SubscriptionTierSelection {
  readonly majorEvent = input.required<PublicMajorEvent>();
  readonly tiers = input.required<PublicMajorEventPriceTier[]>();
  readonly events = input<PublicEvent[] | undefined>();
  readonly selectedName = input<string | null>(null);
  readonly busy = input(false);
  readonly locked = input(false);
  readonly selectTier = output<string>();
  readonly continue = output<void>();
  readonly selectedTier = computed(() => this.tiers().find((tier) => tier.name === this.selectedName()) ?? null);
  readonly sportsOpen = computed(() => {
    const tournament = this.majorEvent().sportsTournament;
    return tournament?.selfSubscriptionEnabled === true && tournament.registrationOpen === true;
  });

  tierRuleSummaries(tier: PublicMajorEventPriceTier): string[] {
    return subscriptionTierRuleSummaries(this.majorEvent(), tier, this.events());
  }

  hasSelectableEvents(tier: PublicMajorEventPriceTier): boolean {
    const events = this.events();
    if (tier.includesEventRegistration === false) {
      return false;
    }
    if (events === undefined) {
      return tier.restrictEventSelection !== true || (tier.allowedEventIds?.length ?? 0) > 0;
    }
    return selectableEventIds(events, tier).size > 0;
  }

  canContinue(tier: PublicMajorEventPriceTier): boolean {
    const hasEventAccess = tier.includesEventRegistration !== false;
    return (!hasEventAccess || this.hasSelectableEvents(tier)) && this.automaticSelectionErrors(tier).length === 0;
  }

  automaticSelectionErrors(tier: PublicMajorEventPriceTier): string[] {
    const events = this.events();
    return events === undefined ? [] : automaticSelectionLimitViolations(this.majorEvent(), events, tier);
  }

  tierAvailabilityMessage(tier: PublicMajorEventPriceTier): string | null {
    if (this.automaticSelectionErrors(tier).length > 0) {
      return 'A inscrição automática ultrapassa os limites desta modalidade. Escolha outra modalidade para continuar.';
    }
    if (tier.includesEventRegistration !== false && !this.hasSelectableEvents(tier)) {
      return 'Esta modalidade não tem eventos disponíveis. Escolha outra modalidade para continuar.';
    }
    return null;
  }

  continueLabel(): string {
    const tier = this.selectedTier();
    if (!tier || !this.canContinue(tier)) {
      return 'Modalidade indisponível';
    }
    return tier.includesEventRegistration !== false ? 'Continuar para eventos' : 'Continuar inscrição';
  }

  canContinueSelectedTier(): boolean {
    const tier = this.selectedTier();
    return Boolean(tier && this.canContinue(tier));
  }
}
