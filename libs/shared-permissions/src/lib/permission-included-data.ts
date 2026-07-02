import { Permission } from './permission-types';

export type PermissionIncludedData = {
  label: string;
  fields: readonly string[];
};

const LIMITED_PERSON_IDENTITY = [
  'nome',
  'e-mail principal',
  'telefone',
  'documento',
  'ID acadêmico',
] as const;

const EVENT_CONTEXT_FIELDS = ['nome', 'datas', 'tipo', 'grupo', 'grande evento'] as const;

const SUBSCRIPTION_CONTEXT_FIELDS = [
  'status',
  'eventos selecionados',
  'valores e faixa de pagamento',
  'origem da inscrição',
] as const;

const RECEIPT_CONTEXT_FIELDS = [
  'imagem do comprovante',
  'texto OCR',
  'valor identificado',
  'nome identificado',
  'histórico de validação',
] as const;

export const EVENT_MANAGER_PERMISSION_INCLUDED_DATA: Readonly<
  Partial<Record<Permission, readonly PermissionIncludedData[]>>
> = {
  [Permission.EventLecturer.Read]: [
    {
      label: 'Dados limitados da pessoa ministrante',
      fields: LIMITED_PERSON_IDENTITY,
    },
    {
      label: 'Contexto do evento',
      fields: EVENT_CONTEXT_FIELDS,
    },
  ],
  [Permission.EventLecturer.Create]: [
    {
      label: 'Identificação da pessoa ministrante',
      fields: ['ID da pessoa', 'nome'],
    },
  ],
  [Permission.EventLecturer.Update]: [
    {
      label: 'Identificação da pessoa ministrante',
      fields: ['ID da pessoa', 'nome'],
    },
  ],
  [Permission.EventLecturer.Delete]: [
    {
      label: 'Identificação da pessoa ministrante',
      fields: ['ID da pessoa', 'nome'],
    },
  ],
  [Permission.EventForm.Read]: [
    {
      label: 'Conteúdo do formulário',
      fields: ['nome', 'descrição', 'perguntas', 'vínculo com evento ou grande evento'],
    },
    {
      label: 'Respostas conforme sigilo',
      fields: ['resumo agregado', 'identificação e respostas quando permitido pelo sigilo'],
    },
  ],
  [Permission.EventForm.Create]: [
    {
      label: 'Configuração do formulário',
      fields: ['nome', 'descrição', 'perguntas', 'sigilo', 'público habilitado'],
    },
  ],
  [Permission.EventForm.Update]: [
    {
      label: 'Configuração do formulário',
      fields: ['nome', 'descrição', 'perguntas', 'vínculos', 'exigência de respostas'],
    },
  ],
  [Permission.EventForm.Publish]: [
    {
      label: 'Publicação do formulário',
      fields: ['estado de publicação', 'agendamento', 'notificações'],
    },
  ],
  [Permission.EventForm.Results]: [
    {
      label: 'Resultados do formulário',
      fields: ['resumo agregado', 'respostas individuais conforme sigilo'],
    },
  ],
  [Permission.EventForm.Export]: [
    {
      label: 'Exportação de respostas',
      fields: ['CSV de respostas conforme sigilo e escopo autorizado'],
    },
  ],
  [Permission.EventAttendance.Read]: [
    {
      label: 'Dados limitados da pessoa presente',
      fields: LIMITED_PERSON_IDENTITY,
    },
    {
      label: 'Contexto da presença',
      fields: ['evento', 'data da coleta', 'categoria', 'coletor'],
    },
  ],
  [Permission.EventAttendance.Collect]: [
    {
      label: 'Identificação mínima para coleta',
      fields: ['nome', 'código de usuário', 'documento', 'perfil Unesp'],
    },
    {
      label: 'Contexto de inscrição relacionado',
      fields: ['status da inscrição', 'eventos selecionados'],
    },
  ],
  [Permission.EventAttendance.Import]: [
    {
      label: 'Identificação para conciliação de importação',
      fields: ['nome', 'e-mail principal', 'documento', 'ID acadêmico'],
    },
    {
      label: 'Contexto de inscrição relacionado',
      fields: ['status da inscrição', 'eventos selecionados'],
    },
  ],
  [Permission.EventAttendance.Update]: [
    {
      label: 'Dados limitados da presença existente',
      fields: ['pessoa', 'evento', 'data da coleta', 'categoria'],
    },
  ],
  [Permission.EventAttendance.Delete]: [
    {
      label: 'Dados limitados da presença existente',
      fields: ['pessoa', 'evento', 'data da coleta'],
    },
  ],
  [Permission.EventAttendanceCollector.Read]: [
    {
      label: 'Dados limitados da pessoa coletora',
      fields: ['nome', 'e-mail principal', 'ID da pessoa'],
    },
    {
      label: 'Contexto do evento',
      fields: EVENT_CONTEXT_FIELDS,
    },
  ],
  [Permission.EventAttendanceCollector.Create]: [
    {
      label: 'Identificação da pessoa coletora',
      fields: ['ID da pessoa', 'nome'],
    },
  ],
  [Permission.EventAttendanceCollector.Delete]: [
    {
      label: 'Identificação da pessoa coletora',
      fields: ['ID da pessoa', 'nome'],
    },
  ],
  [Permission.Subscription.Read]: [
    {
      label: 'Dados limitados da pessoa inscrita',
      fields: LIMITED_PERSON_IDENTITY,
    },
    {
      label: 'Contexto da inscrição',
      fields: SUBSCRIPTION_CONTEXT_FIELDS,
    },
  ],
  [Permission.Subscription.Create]: [
    {
      label: 'Identificação da pessoa inscrita',
      fields: ['ID da pessoa', 'nome', 'e-mail principal', 'documento'],
    },
    {
      label: 'Contexto de elegibilidade da inscrição',
      fields: ['evento', 'grande evento', 'vagas', 'ministrante vinculado'],
    },
  ],
  [Permission.Subscription.Update]: [
    {
      label: 'Dados limitados da pessoa inscrita',
      fields: LIMITED_PERSON_IDENTITY,
    },
    {
      label: 'Contexto de alteração da inscrição',
      fields: SUBSCRIPTION_CONTEXT_FIELDS,
    },
  ],
  [Permission.Subscription.Import]: [
    {
      label: 'Identificação para conciliação de importação',
      fields: ['nome', 'e-mail principal', 'documento', 'ID acadêmico'],
    },
    {
      label: 'Contexto de elegibilidade da inscrição',
      fields: ['evento', 'grande evento', 'vagas'],
    },
  ],
  [Permission.Subscription.Delete]: [
    {
      label: 'Dados limitados da inscrição existente',
      fields: ['pessoa', 'evento ou grande evento', 'status'],
    },
  ],
  [Permission.Receipt.Read]: [
    {
      label: 'Dados limitados da pessoa inscrita',
      fields: ['nome', 'e-mail principal', 'telefone'],
    },
    {
      label: 'Contexto de inscrição e comprovante',
      fields: [...SUBSCRIPTION_CONTEXT_FIELDS, ...RECEIPT_CONTEXT_FIELDS],
    },
  ],
  [Permission.Receipt.Approve]: [
    {
      label: 'Contexto necessário para aprovação',
      fields: ['pessoa inscrita', 'eventos selecionados', 'vagas', 'comprovante mais recente'],
    },
  ],
  [Permission.Receipt.Reject]: [
    {
      label: 'Contexto necessário para recusa',
      fields: ['pessoa inscrita', 'status da inscrição', 'comprovante mais recente'],
    },
  ],
  [Permission.Receipt.Undo]: [
    {
      label: 'Contexto da ação de validação',
      fields: ['pessoa inscrita', 'ação anterior', 'comprovante relacionado'],
    },
  ],
  [Permission.Certificate.Read]: [
    {
      label: 'Dados limitados da pessoa certificada',
      fields: ['nome', 'ID da pessoa'],
    },
    {
      label: 'Contexto do certificado',
      fields: ['evento', 'grupo', 'grande evento', 'configuração', 'dados renderizados'],
    },
  ],
  [Permission.Certificate.Issue]: [
    {
      label: 'Dados limitados da pessoa elegível',
      fields: ['nome', 'ID da pessoa'],
    },
    {
      label: 'Contexto de elegibilidade do certificado',
      fields: ['presenças', 'inscrições', 'eventos creditados', 'configuração'],
    },
  ],
  [Permission.Certificate.Reissue]: [
    {
      label: 'Dados limitados da pessoa certificada',
      fields: ['nome', 'ID da pessoa'],
    },
    {
      label: 'Contexto de reemissão',
      fields: ['certificado existente', 'configuração', 'dados renderizados'],
    },
  ],
  [Permission.Certificate.Delete]: [
    {
      label: 'Dados limitados do certificado existente',
      fields: ['pessoa certificada', 'configuração', 'evento ou grande evento'],
    },
  ],
};

export function getPermissionIncludedData(permission: Permission): readonly PermissionIncludedData[] {
  return EVENT_MANAGER_PERMISSION_INCLUDED_DATA[permission] ?? [];
}

export function getPermissionIncludedDataSummary(permission: Permission): string {
  return getPermissionIncludedData(permission)
    .map((item) => `${item.label}: ${item.fields.join(', ')}`)
    .join('; ');
}
