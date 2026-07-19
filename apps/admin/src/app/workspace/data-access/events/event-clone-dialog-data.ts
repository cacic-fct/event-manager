import type { CloneAssetDialogData } from '../../features/events/dialogs/clone-asset-dialog.component';

export function createEventCloneDialogData(
  eventName: string,
  permissions: { canCopyLecturers: boolean; canCopyCertificateConfig: boolean; canCopyAttendances: boolean },
): CloneAssetDialogData {
  return {
    title: 'Duplicar evento',
    sourceLabel: 'Evento existente',
    sourceName: eventName,
    defaultName: `${eventName} (cópia)`,
    parts: [
      {
        key: 'lecturers',
        label: 'Ministrantes',
        description: 'Copia os vínculos com pessoas ministrantes.',
        defaultSelected: true,
        disabled: !permissions.canCopyLecturers,
        disabledReason: 'Exige permissão para visualizar e criar ministrantes do evento.',
      },
      {
        key: 'certificateConfig',
        label: 'Configuração de certificado',
        description: 'Copia regras de emissão e modelos de certificado.',
        defaultSelected: true,
        disabled: !permissions.canCopyCertificateConfig,
        disabledReason: 'Exige permissão para visualizar e criar configurações de certificado.',
      },
      {
        key: 'subscriptionSettings',
        label: 'Inscrições',
        description: 'Copia janela, vagas e regras administrativas de inscrição.',
        defaultSelected: true,
      },
      {
        key: 'attendanceSettings',
        label: 'Presença',
        description: 'Copia coleta e janelas de presença, sem copiar o código de presença.',
        defaultSelected: true,
      },
      {
        key: 'attendances',
        label: 'Registros de presença',
        description: 'Copia as pessoas presentes. O novo registro identifica quem duplicou o evento.',
        defaultSelected: false,
        disabled: !permissions.canCopyAttendances,
        disabledReason: 'Exige permissão para visualizar presenças de origem e registrar presenças no novo evento.',
      },
      { key: 'place', label: 'Local', description: 'Copia coordenadas e descrição do local.', defaultSelected: true },
      {
        key: 'visibility',
        label: 'Visibilidade',
        description: 'Copia se o evento aparece para usuários.',
        defaultSelected: true,
      },
    ],
  };
}
