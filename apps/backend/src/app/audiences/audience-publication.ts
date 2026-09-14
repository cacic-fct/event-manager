import { BadRequestException } from '@nestjs/common';

export const AUDIENCE_PUBLICATION_SELECT = {
  audience: true,
  audienceInvitations: {
    where: { person: { deletedAt: null, mergedIntoId: null } },
    select: { personId: true },
    take: 1,
  },
} as const;

export type AudiencePublicationTarget = {
  audience?: string;
  audienceInvitations?: readonly { personId: string }[];
  eventGroup?: AudiencePublicationTarget | null;
  majorEvent?: AudiencePublicationTarget | null;
};

export function assertAudiencePublicationReady(target: AudiencePublicationTarget): void {
  if (target.audience === 'INVITATION_ONLY' && !target.audienceInvitations?.length) {
    throw new BadRequestException('Adicione pelo menos uma pessoa convidada antes de publicar ou agendar este registro.');
  }
  if (target.eventGroup) assertAudiencePublicationReady(target.eventGroup);
  if (target.majorEvent) assertAudiencePublicationReady(target.majorEvent);
}
