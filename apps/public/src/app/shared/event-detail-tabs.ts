import { NgTemplateOutlet } from '@angular/common';
import { Component, input, linkedSignal, TemplateRef } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';

@Component({
  selector: 'app-event-detail-tabs',
  imports: [NgTemplateOutlet, MatIconModule, MatTabsModule],
  template: `
    @if (hasSubscription()) {
      <mat-tab-group
        class="event-detail-tab-group"
        [mat-stretch-tabs]="true"
        animationDuration="0ms"
        [preserveContent]="true"
        [selectedIndex]="selectedIndex()"
        (selectedIndexChange)="selectedIndex.set($event)"
        aria-label="Informações do evento">
        <mat-tab>
          <ng-template mat-tab-label>
            <span class="workspace-tab-label">
              <mat-icon aria-hidden="true">how_to_reg</mat-icon>
              <span class="full-label">Minha inscrição</span><span class="short-label">Inscrição</span>
            </span>
          </ng-template>
          <ng-template matTabContent>
            <div class="tab-content"><ng-container [ngTemplateOutlet]="subscriptionContent()" /></div>
          </ng-template>
        </mat-tab>
        <mat-tab>
          <ng-template mat-tab-label>
            <span class="workspace-tab-label">
              <mat-icon aria-hidden="true">info</mat-icon>
              <span class="full-label">Sobre o evento</span><span class="short-label">Sobre</span>
            </span>
          </ng-template>
          <ng-template matTabContent>
            <div class="tab-content"><ng-container [ngTemplateOutlet]="generalContent()" /></div>
          </ng-template>
        </mat-tab>
      </mat-tab-group>
    } @else {
      <ng-container [ngTemplateOutlet]="generalContent()" />
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      margin-top: 24px;
    }
    .workspace-tab-label {
      align-items: center;
      display: inline-flex;
      gap: 0.5rem;
      min-height: 2.75rem;
    }
    .workspace-tab-label mat-icon {
      flex: 0 0 auto;
    }
    .tab-content {
      padding-top: 24px;
    }
    .short-label {
      display: none;
    }
    @media (max-width: 599px) {
      .full-label {
        display: none;
      }
      .short-label {
        display: inline;
      }
      :host ::ng-deep .event-detail-tab-group .mat-mdc-tab {
        min-width: 0;
        padding-inline: 12px;
      }
    }
  `,
})
export class EventDetailTabs {
  readonly hasSubscription = input(false);
  readonly contextKey = input.required<string>();
  readonly subscriptionContent = input.required<TemplateRef<unknown>>();
  readonly generalContent = input.required<TemplateRef<unknown>>();
  readonly selectedIndex = linkedSignal({
    source: () => ({ contextKey: this.contextKey(), hasSubscription: this.hasSubscription() }),
    computation: () => 0,
  });
}
