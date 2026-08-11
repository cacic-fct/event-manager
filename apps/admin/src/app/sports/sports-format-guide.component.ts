import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { sportsFormatLabel, type SportsFormat } from '@cacic-fct/shared-data-types/sports-metadata';

export const SPORTS_FORMAT_OPTIONS = [
  {
    value: 'SINGLE_ELIMINATION',
    label: sportsFormatLabel('SINGLE_ELIMINATION'),
    description: 'Quem perde sai. Rápido, direto e adequado para poucas datas.',
  },
  {
    value: 'ROUND_ROBIN',
    label: sportsFormatLabel('ROUND_ROBIN'),
    description: 'Cada equipe enfrenta as demais e a classificação vem por pontos.',
  },
  {
    value: 'GROUP_STAGE_ELIMINATION',
    label: sportsFormatLabel('GROUP_STAGE_ELIMINATION'),
    description: 'Classificação dentro de grupos, seguida por confrontos eliminatórios.',
  },
  {
    value: 'DOUBLE_ELIMINATION',
    label: sportsFormatLabel('DOUBLE_ELIMINATION'),
    description: 'A segunda derrota elimina; há chaves de vencedores e de recuperação.',
  },
  {
    value: 'SWISS',
    label: sportsFormatLabel('SWISS'),
    description: 'Rodadas pareiam equipes de campanha semelhante sem todos se enfrentarem.',
  },
  {
    value: 'CUSTOM',
    label: sportsFormatLabel('CUSTOM'),
    description: 'A administração define os confrontos e avanços manualmente.',
  },
] as const satisfies readonly {
  value: SportsFormat;
  label: string;
  description: string;
}[];

@Component({
  selector: 'app-sports-format-guide',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <section class="format-gallery" aria-label="Comparação de formatos">
      @for (format of formats; track format.value) {
        <button
          type="button"
          [class.selected]="currentFormat() === format.value"
          (click)="formatSelected.emit(format.value)">
          <strong>{{ format.label }}</strong>
          <span>{{ format.description }}</span>
        </button>
      }
    </section>

    @for (format of formats; track format.value) {
      @if (currentFormat() === format.value) {
        <section class="format-explainer">
          <div>
            <mat-icon>account_tree</mat-icon>
            <span
              ><strong>{{ format.label }}</strong
              >{{ format.description }}</span
            >
          </div>
          <div
            class="dummy-bracket"
            [attr.data-format]="format.value"
            [attr.aria-label]="'Exemplo ilustrativo: ' + format.label">
            @switch (format.value) {
              @case ('SINGLE_ELIMINATION') {
                <span>Equipe A × Equipe B</span><i>→</i><b>Vencedor avança</b> <span>Equipe C × Equipe D</span><i>→</i
                ><b>Vencedor avança</b>
                <em>Final</em>
              }
              @case ('ROUND_ROBIN') {
                <span>A × B</span><span>A × C</span><span>B × C</span>
                <em>Tabela por pontos</em>
              }
              @case ('GROUP_STAGE_ELIMINATION') {
                <span>Grupo A</span><span>Grupo B</span><i>→</i><b>Semifinais</b><i>→</i><em>Final</em>
              }
              @case ('DOUBLE_ELIMINATION') {
                <span>Chave de vencedores</span><i>↓ 1ª derrota</i> <span>Chave de recuperação</span><i>→</i
                ><em>Final</em>
              }
              @case ('SWISS') {
                <span>1 a 0 × 1 a 0</span><span>0 a 1 × 0 a 1</span> <i>→</i><em>Nova rodada por campanha</em>
              }
              @default {
                <span>Confrontos manuais</span><i>→</i>
                <em>Avanços definidos pela organização</em>
              }
            }
          </div>
        </section>
      }
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.75rem;
    }
    .format-gallery {
      display: grid;
      gap: 0.5rem;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .format-gallery button {
      background: var(--mat-sys-surface-container-low);
      border: 1px solid transparent;
      border-radius: 10px;
      color: var(--mat-sys-on-surface);
      cursor: pointer;
      display: grid;
      font: inherit;
      gap: 0.25rem;
      padding: 0.7rem;
      text-align: start;
    }
    .format-gallery button:hover,
    .format-gallery button:focus-visible {
      border-color: var(--mat-sys-outline);
      outline: none;
    }
    .format-gallery button.selected {
      background: var(--mat-sys-primary-container);
      border-color: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary-container);
    }
    .format-gallery span,
    .dummy-bracket {
      font-size: 0.78rem;
    }
    .format-explainer {
      background: var(--mat-sys-primary-container);
      border-radius: 14px;
      color: var(--mat-sys-on-primary-container);
      display: grid;
      gap: 1rem;
      grid-template-columns: minmax(0, 1fr) minmax(14rem, 0.8fr);
      padding: 1rem;
    }
    .format-explainer > div:first-child {
      align-items: start;
      display: flex;
      gap: 0.75rem;
    }
    .format-explainer strong {
      display: block;
      margin-block-end: 0.2rem;
    }
    .dummy-bracket {
      align-items: center;
      display: grid;
      gap: 0.25rem 0.6rem;
      grid-template-columns: minmax(7rem, 1fr) auto minmax(7rem, 1fr);
    }
    .dummy-bracket span,
    .dummy-bracket b,
    .dummy-bracket em {
      background: color-mix(in srgb, var(--mat-sys-surface) 75%, transparent);
      border-radius: 6px;
      font-style: normal;
      padding: 0.3rem 0.45rem;
      text-align: center;
    }
    .dummy-bracket em {
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
      font-weight: 700;
    }
    .dummy-bracket[data-format='SINGLE_ELIMINATION'] em,
    .dummy-bracket[data-format='SWISS'] em {
      grid-column: 3;
      grid-row: 1 / span 2;
    }
    .dummy-bracket[data-format='ROUND_ROBIN'] {
      grid-template-columns: repeat(3, 1fr);
    }
    .dummy-bracket[data-format='ROUND_ROBIN'] em {
      grid-column: 1 / -1;
    }
    @media (max-width: 700px) {
      .format-gallery,
      .format-explainer {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class SportsFormatGuideComponent {
  readonly currentFormat = input.required<string>();
  readonly formatSelected = output<SportsFormat>();
  protected readonly formats = SPORTS_FORMAT_OPTIONS;
}
