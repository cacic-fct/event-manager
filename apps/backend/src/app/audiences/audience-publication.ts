import { BadRequestException } from '@nestjs/common';

export const AUDIENCE_PUBLICATION_SELECT = {
  audience: true,
  attendanceEligibility: true,
  audienceInvitations: {
    where: { person: { deletedAt: null, mergedIntoId: null } },
    select: { personId: true },
    take: 1,
  },
} as const;

export type AudiencePublicationTarget = {
  audience?: string;
  attendanceEligibility?: string | null;
  deletedAt?: Date | null;
  audienceInvitations?: readonly { personId: string }[];
  eventGroup?: AudiencePublicationTarget | null;
  majorEvent?: AudiencePublicationTarget | null;
};

export function assertAudiencePublicationReady(target: AudiencePublicationTarget): void {
  assertAccessInvitationsReady(target);
  const policyOwner = [target, target.eventGroup, target.majorEvent].find(
    (candidate) => candidate && !candidate.deletedAt && candidate.attendanceEligibility != null,
  );
  if (policyOwner?.attendanceEligibility === 'INVITED_ONLY' && !policyOwner.audienceInvitations?.length) {
    throw new BadRequestException('Adicione pelo menos uma pessoa convidada para confirmar presença antes de publicar ou agendar este registro.');
  }
}

function assertAccessInvitationsReady(target: AudiencePublicationTarget): void {
  if (target.audience === 'INVITATION_ONLY' && !target.audienceInvitations?.length) {
    throw new BadRequestException('Adicione pelo menos uma pessoa convidada antes de publicar ou agendar este registro.');
  }
  if (target.eventGroup && !target.eventGroup.deletedAt) assertAccessInvitationsReady(target.eventGroup);
  if (target.majorEvent && !target.majorEvent.deletedAt) assertAccessInvitationsReady(target.majorEvent);
}
