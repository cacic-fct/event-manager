import { CurrencyPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import type { PublicMajorEvent, PublicMajorEventPriceTier } from '@cacic-fct/event-manager-public-contracts';

@Component({
  selector: 'app-subscription-tier-selection',
  imports: [CurrencyPipe, MatButtonModule, MatIconModule, MatRadioModule],
  templateUrl: './tier-selection.html',
  styleUrl: './tier-selection.css',
})
export class SubscriptionTierSelection {
  readonly majorEvent = input.required<PublicMajorEvent>();
  readonly tiers = input.required<PublicMajorEventPriceTier[]>();
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
}
