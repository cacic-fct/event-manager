import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventAudience, Prisma } from '@prisma/client';
import { AudienceInvitationService, type AudienceInvitationTarget } from './audience-invitation.service';
import { audienceContext } from './audience-context';

export type AudienceInput = {
  audience?: EventAudience | null;
  audienceCourseCodes?: string[] | null;
  invitationPersonIds?: string[] | null;
};

export function normalizeAudienceInput(input: AudienceInput, previous?: { audience?: EventAudience; audienceCourseCodes?: string[] }) {
  if (input.audience === null || input.audienceCourseCodes === null || input.invitationPersonIds === null) {
    throw new BadRequestException('Audience settings cannot be null.');
  }
  const audience = input.audience ?? previous?.audience ?? EventAudience.PUBLIC;
  if (!Object.values(EventAudience).includes(audience)) throw new BadRequestException('Invalid event audience.');
  const courses = input.audienceCourseCodes ?? previous?.audienceCourseCodes ?? [];
  if (!Array.isArray(courses) || courses.some((code) => code !== '12')) {
    throw new BadRequestException('Only the Computer Science course code 12 is supported.');
  }
  if (audience === EventAudience.COURSE_ONLY && courses.length === 0) {
    throw new BadRequestException('Select a course for a course-only audience.');
  }
  if (input.invitationPersonIds !== undefined && (
    !Array.isArray(input.invitationPersonIds) || input.invitationPersonIds.length > 1000 ||
    input.invitationPersonIds.some((id) => typeof id !== 'string' || !id.trim() || id.length > 200)
  )) {
    throw new BadRequestException('Select at most 1000 valid people for invitations.');
  }
  return { audience, audienceCourseCodes: audience === EventAudience.COURSE_ONLY ? [...new Set(courses)] : [] };
}

export const AUDIENCE_ADMIN_SELECT = {
  audience: true,
  audienceCourseCodes: true,
  audienceInvitations: { select: { personId: true, person: { select: { id: true, name: true, email: true } } } },
} as const;

export type AudienceChange = {
  target: AudienceInvitationTarget;
  personIds: string[];
  previousInvitationPersonIds?: string[];
  invitationPersonIds?: string[];
};

/** Called inside the same transaction as the target edit, before any notification. */
export async function applyAudienceSettings(
  tx: Prisma.TransactionClient,
  invitations: AudienceInvitationService,
  target: AudienceInvitationTarget,
  input: AudienceInput,
  previous?: { audience?: EventAudience; audienceCourseCodes?: string[] },
  actorId?: string,
): Promise<AudienceChange | undefined> {
  if (input.audience === undefined && input.audienceCourseCodes === undefined && input.invitationPersonIds === undefined) return undefined;
  const settings = normalizeAudienceInput(input, previous);
  const changes = input.invitationPersonIds === undefined ? undefined : await invitations.replaceInvitations(target, input.invitationPersonIds ?? [], actorId, tx);
  const principal = audienceContext.getStore();
  if (principal && !principal.bypass) {
    const included = settings.audience === EventAudience.PUBLIC ||
      (settings.audience === EventAudience.UNESP_ONLY && principal.isUnesp) ||
      (settings.audience === EventAudience.COURSE_ONLY && principal.verifiedCourseCode !== null && settings.audienceCourseCodes.includes(principal.verifiedCourseCode)) ||
      (settings.audience === EventAudience.INVITATION_ONLY && (changes?.invitations ?? await invitations.listInvitations(target, tx)).some((invitation) => principal.personIds.includes(invitation.personId)));
    if (!included) throw new ForbiddenException('Para gerenciar um evento fora do seu público-alvo, é necessária a permissão de acesso fora do público-alvo.');
  }
  switch (target.targetType) {
    case 'EVENT':
      await tx.event.update({ where: { id: target.targetId }, data: settings });
      await tx.event.findUniqueOrThrow({ where: { id: target.targetId }, select: { id: true } });
      break;
    case 'EVENT_GROUP':
      await tx.eventGroup.update({ where: { id: target.targetId }, data: settings });
      await tx.eventGroup.findUniqueOrThrow({ where: { id: target.targetId }, select: { id: true } });
      break;
    case 'MAJOR_EVENT':
      await tx.majorEvent.update({ where: { id: target.targetId }, data: settings });
      await tx.majorEvent.findUniqueOrThrow({ where: { id: target.targetId }, select: { id: true } });
      break;
  }
  const personIds = settings.audience !== EventAudience.INVITATION_ONLY ? [] : previous?.audience === EventAudience.INVITATION_ONLY
    ? changes?.addedPersonIds ?? []
    : (changes?.invitations ?? await invitations.listInvitations(target, tx)).map((invitation) => invitation.personId);
  return {
    target,
    personIds,
    ...(changes ? {
      previousInvitationPersonIds: [...changes.invitations.filter((item) => !changes.addedPersonIds.includes(item.personId)).map((item) => item.personId), ...changes.removedPersonIds].sort(),
      invitationPersonIds: changes.invitations.map((item) => item.personId).sort(),
    } : {}),
  };
}

export function withAudienceAudit<T extends object>(record: T, change: AudienceChange | undefined, before = false): T & { invitationPersonIds?: string[] } {
  const invitationPersonIds = before ? change?.previousInvitationPersonIds : change?.invitationPersonIds;
  return invitationPersonIds ? { ...record, invitationPersonIds } : record;
}

export function assertAudienceCloneAllowed(audience: EventAudience | undefined): void {
  const principal = audienceContext.getStore();
  if (audience === EventAudience.INVITATION_ONLY && principal && !principal.bypass) {
    throw new ForbiddenException('Duplicar um registro por convite sem copiar seus convidados exige a permissão de acesso fora do público-alvo.');
  }
}

export function withoutAudienceInput<T extends AudienceInput>(input: T): Omit<T, keyof AudienceInput> {
  const rest = { ...input };
  delete rest.audience;
  delete rest.audienceCourseCodes;
  delete rest.invitationPersonIds;
  return rest;
}
