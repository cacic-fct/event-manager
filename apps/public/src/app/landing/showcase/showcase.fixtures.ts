export type ParticipantFeature = 'day' | 'events' | 'wallet' | 'attendance' | 'notifications' | 'history';
export type OrganizerFeature = 'events' | 'dashboard' | 'attendance' | 'certificates' | 'draws' | 'roles' | 'audit';

export const PARTICIPANT_FEATURES = [
  {
    id: 'day',
    icon: 'today',
    label: 'Meu dia',
    title: 'Seu dia, já organizado.',
    description: 'Veja as atividades do dia, seu próximo compromisso e as pendências que precisam de atenção.',
    details: [],
  },
  {
    id: 'events',
    icon: 'event_available',
    label: 'Eventos e inscrições',
    title: 'Eventos em poucos cliques.',
    description: 'Explore a programação, conheça cada atividade e faça sua inscrição com os dados da sua Conta CACiC.',
    details: [],
  },
  {
    id: 'wallet',
    icon: 'wallet',
    label: 'Carteira',
    title: 'Leve o crachá no bolso.',
    description: 'Credencial e bilhetes na sua carteira virtual, basta apresentar seu celular para a organização.',
    details: ['Funciona sem internet.'],
  },
  {
    id: 'attendance',
    icon: 'how_to_reg',
    label: 'Autorregistro',
    title: 'Você mesmo confirma sua presença.',
    description:
      'Quando o autorregistro está habilitado, confirme a presença com o código disponibilizado pela organização.',
    details: ['Digite o código de quatro caracteres ou leia o QR Code.', 'Sem filas para marcar presença.'],
  },
  {
    id: 'notifications',
    icon: 'notifications',
    label: 'Notificações',
    title: 'O próximo passo chega até você.',
    description:
      'Um bilhete recebido, uma presença pendente ou um certificado disponível. As notificações levam você direto ao que importa.',
    details: [],
  },
  {
    id: 'history',
    icon: 'history',
    label: 'Participações',
    title: 'Cada encontro deixa uma história.',
    description: 'Revisite suas participações, confira a situação de cada evento e emita os seus certificados.',
    details: ['Baixe um certificado ou todos de uma vez.'],
  },
] as const satisfies readonly {
  id: ParticipantFeature;
  icon: string;
  label: string;
  title: string;
  description: string;
  details: readonly string[];
}[];

export const ORGANIZER_FEATURES = [
  {
    id: 'dashboard',
    icon: 'space_dashboard',
    label: 'Painel inteligente',
    title: 'Veja o que precisa de atenção.',
    description:
      'Um painel que conecta a programação ao que precisa de ação: presenças, comprovantes, revisões esportivas e certificados.',
    details: ['Eventos do dia e próximos compromissos reunidos.', 'Pendências com atalhos para as tarefas da equipe.'],
  },
  {
    id: 'events',
    icon: 'event_available',
    label: 'Eventos e inscrições',
    title: 'Da programação às pessoas, tudo conectado.',
    description:
      'Organize eventos, grupos de eventos e grandes eventos. Acompanhe inscrições e filas de espera sem perder de vista a atividade.',
    details: ['Programação, locais e vagas de cada evento.', 'Listas de inscritos para acompanhar cada evento.'],
  },
  {
    id: 'attendance',
    icon: 'fact_check',
    label: 'Presenças',
    title: 'Um gesto, uma presença.',
    description:
      'Deslize para marcar presença ou falta. Prefere de outra maneira? Alterne e continue a chamada do seu jeito.',
    details: ['Cartões, lista e histórico na mesma chamada.', 'Coleta por credencial, chamada oral e autorregistro.'],
  },
  {
    id: 'certificates',
    icon: 'verified',
    label: 'Certificados',
    title: 'A participação vira reconhecimento.',
    description: 'Configure a emissão e disponibilize certificados digitais.',
    details: ['Configurações por evento, grupo de eventos ou grande evento.', 'Validação pública com QR Code.'],
  },
  {
    id: 'draws',
    icon: 'redeem',
    label: 'Sorteios',
    title: 'Roleta imparcial.',
    description: 'Prepare os prêmios, defina os participantes e acompanhe o sorteio junto com o público.',
    details: ['Vencedor escolhido aleatoriamente.', 'Resultado e histórico disponíveis para acompanhamento.'],
  },
  {
    id: 'roles',
    icon: 'admin_panel_settings',
    label: 'Equipe e permissões',
    title: 'O acesso certo para cada pessoa.',
    description: 'Crie cargos para sua equipe e defina as permissões de cada um, da recepção à coordenação.',
    details: [
      'Permissões organizadas por responsabilidade.',
      'Cargos que acompanham a divisão de tarefas de cada equipe.',
    ],
  },
  {
    id: 'audit',
    icon: 'manage_search',
    label: 'Histórico de alterações',
    title: 'Cada mudança conta uma história.',
    description: 'Acompanhe quem alterou o quê e quando.',
    details: [],
  },
] as const satisfies readonly {
  id: OrganizerFeature;
  icon: string;
  label: string;
  title: string;
  description: string;
  details: readonly string[];
}[];

export const DEMO_ATTENDANCE_CODE = 'KC1C';
