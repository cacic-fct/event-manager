import type { CertificateParticipationSummary } from '@cacic-fct/event-manager-public-contracts';

export interface CertificateStatusCopy {
  title: string;
  description: string;
  icon: string;
  action?: { label: string; route: string[] };
}

export function certificateStatusCopy(summary: CertificateParticipationSummary): CertificateStatusCopy {
  switch (summary.status) {
    case 'ATTENDANCE_CONFIRMED':
      return {
        title: 'Aguardando liberação',
        icon: 'verified',
        description: 'Suas presenças estão confirmadas. O certificado aguarda a liberação da organização.',
      };
    case 'AWAITING_RELEASE':
      return {
        title: 'Aguardando liberação',
        icon: 'verified',
        description: 'Sua participação atende às regras. O certificado aguarda a liberação da organização.',
      };
    case 'PARTICIPATION_PENDING':
      return {
        title: 'Aguardando sua participação',
        icon: 'event_available',
        description: 'Participe dos eventos previstos e confirme sua presença com a equipe responsável.',
      };
    case 'ATTENDANCE_UNCONFIRMED':
      return {
        title: 'Presença ainda não confirmada',
        icon: 'schedule',
        description:
          'Se você participou, peça à organização para conferir sua presença. O registro pode estar aguardando sincronização.',
      };
    case 'ATTENDANCE_UNDER_REVIEW':
      return {
        title: 'Presença em análise',
        icon: 'pending_actions',
        description:
          'Seu registro foi recebido e aguarda conferência da organização. A presença ainda não está confirmada.',
      };
    case 'GROUP_ATTENDANCE_INCOMPLETE':
      return {
        title: 'Faltam presenças no grupo',
        icon: 'fact_check',
        description:
          'O certificado deste grupo exige presença em todos os eventos previstos. Participe dos próximos encontros. Se já participou, peça à organização para conferir as presenças que faltam.',
      };
    case 'PAYMENT_PENDING':
      return {
        title: 'Pagamento pendente',
        icon: 'payments',
        description:
          'Para receber o certificado, regularize o pagamento da inscrição. Confira as orientações e envie o comprovante.',
        action: paymentAction(summary, 'Regularizar pagamento'),
      };
    case 'PAYMENT_UNDER_REVIEW':
      return {
        title: 'Pagamento em análise',
        icon: 'pending_actions',
        description:
          'Seu comprovante aguarda análise da organização. Aguarde a confirmação do pagamento para continuar a verificação do certificado.',
        action: paymentAction(summary, 'Acompanhar pagamento'),
      };
    case 'REGISTRATION_PENDING':
      return {
        title: 'Inscrição pendente',
        icon: 'how_to_reg',
        description: 'Peça à organização para conferir sua inscrição e vinculá-la à sua participação.',
      };
    case 'RULES_UNDER_REVIEW':
    default:
      return {
        title: 'Conferência necessária',
        icon: 'fact_check',
        description:
          'Ainda não foi possível confirmar seu direito ao certificado. Peça à organização para conferir sua participação e as regras de emissão.',
      };
    case 'NOT_OFFERED':
      return {
        title: 'Sem emissão prevista',
        icon: 'info',
        description:
          'Não há emissão de certificado prevista para esta participação. Se tiver dúvidas, consulte a organização.',
      };
  }
}

function paymentAction(summary: CertificateParticipationSummary, label: string): CertificateStatusCopy['action'] {
  return summary.actionTargetId ? { label, route: ['/major-event', summary.actionTargetId, 'payment'] } : undefined;
}
