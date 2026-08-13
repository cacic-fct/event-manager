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
