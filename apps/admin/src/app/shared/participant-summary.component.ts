import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { formatUnespRole } from '@cacic-fct/shared-utils';
export interface ParticipantIdentity {
  id?: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  identityDocument?: string | null;
  academicId?: string | null;
  user?: {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
    unespRole?: string[] | null;
  } | null;
}

@Component({
  selector: 'app-participant-summary',
  imports: [MatIconModule],
  template: `
    <div class="participant-summary">
      @if (showName()) {
        <strong class="participant-name">{{ person().name }}</strong>
      }
      <span class="participant-details">
        @if (primaryContact(); as contact) {
          <span><mat-icon aria-hidden="true">alternate_email</mat-icon>{{ contact }}</span>
        }
        @if (person().academicId; as academicId) {
          <span><mat-icon aria-hidden="true">school</mat-icon>RA {{ academicId }}</span>
        }
        @if (identityDocument(); as document) {
          <span><mat-icon aria-hidden="true">badge</mat-icon>{{ document }}</span>
        }
        @if (unespRoleLabels(); as roleLabels) {
          <span><mat-icon aria-hidden="true">account_balance</mat-icon>{{ roleLabels }}</span>
        }
      </span>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .participant-summary {
      display: grid;
      min-width: 0;
      gap: 0.25rem;
    }

    .participant-name {
      min-width: 0;
      overflow-wrap: anywhere;
      font: var(--mat-sys-body-large);
      font-weight: 600;
    }

    .participant-details {
      display: flex;
      min-width: 0;
      flex-wrap: wrap;
      gap: 0.25rem 0.75rem;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }

    .participant-details span {
      display: inline-flex;
      min-width: 0;
      align-items: center;
      gap: 0.25rem;
      overflow-wrap: anywhere;
    }

    .participant-details mat-icon {
      width: 1rem;
      height: 1rem;
      flex: 0 0 1rem;
      font-size: 1rem;
    }
  `,
})
export class ParticipantSummaryComponent {
  readonly person = input.required<ParticipantIdentity>();
  readonly showName = input(true);
  readonly maskIdentityDocument = input(true);

  protected readonly primaryContact = computed(() => this.person().email || this.person().phone || null);
  protected readonly unespRoleLabels = computed(() => {
    const person = this.person();
    return (
      person.user?.unespRole
        ?.map((role) => formatUnespRole(role, person.academicId))
        .filter((label) => label.length > 0)
        .join(', ') ?? ''
    );
  });
  protected readonly identityDocument = computed(() => {
    const document = this.person().identityDocument?.trim();
    if (!document) {
      return null;
    }
    if (!this.maskIdentityDocument() || document.length <= 4) {
      return document;
    }
    return `•••${document.slice(-4)}`;
  });
}
