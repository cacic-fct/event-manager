import { Component, input } from '@angular/core';
import type { AdminMcpCommand } from '@cacic-fct/event-manager-mcp-contracts';

const TARGET_KIND_LABELS: Record<string, string> = {
  Event: 'Evento',
  EventGroup: 'Grupo de eventos',
  MajorEvent: 'Grande evento',
  Person: 'Pessoa',
  User: 'Conta',
  Place: 'Local',
  EventForm: 'Formulário',
  Certificate: 'Certificado',
  CertificateFolder: 'Pasta de certificados',
  SportsTeam: 'Equipe esportiva',
  SportsTeamMember: 'Integrante de equipe',
  SportsTournament: 'Torneio esportivo',
  SportsCategory: 'Categoria esportiva',
  SportsMatch: 'Partida esportiva',
  SportsVenue: 'Local esportivo',
  SportsRegistration: 'Inscrição esportiva',
};

@Component({
  selector: 'app-command-targets',
  template: `
    @if (targets().length) {
      <section aria-label="Destinos da operação">
        <h3>Destinos</h3>
        <dl>
          @for (target of targets(); track target.kind + ':' + target.id) {
            <div>
              <dt>{{ target.label ?? 'Nome indisponível' }}</dt>
              <dd>{{ kindLabel(target.kind) }}: {{ target.id }}</dd>
            </div>
          }
        </dl>
      </section>
    }
  `,
  styles: `
    h3 {
      font: var(--mat-sys-title-medium);
    }
    dl {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem 1.5rem;
    }
    dl > div {
      min-width: 0;
    }
    dt {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    dd {
      margin: 0.25rem 0 0;
      color: var(--mat-sys-on-surface-variant);
      overflow-wrap: anywhere;
    }
  `,
})
export class CommandTargetsComponent {
  readonly targets = input<NonNullable<AdminMcpCommand['targets']>>([]);

  kindLabel(kind: string): string {
    return TARGET_KIND_LABELS[kind] ?? 'Recurso';
  }
}
