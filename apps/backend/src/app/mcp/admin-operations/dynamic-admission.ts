import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CertificateScope, PrizeDrawTargetType, PublicationTargetType } from '@cacic-fct/shared-data-types';
import type { EventFormInput } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import type { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { assertCanManageLinkedTargets, requireEventForm } from '../../event-forms/event-form-service-support';
import {
  formOwnerTargetInput,
  manageableLinksForReplace,
  normalizeOwner,
  ownerTargetInput,
} from '../../event-forms/event-form-targets';
import type { PrismaService } from '../../prisma/prisma.service';
import { assertPublicationTargetPermission } from '../../publishing/publishing-auth';
import { PublicationBulkOperation } from '../../publishing/publishing.models';
import { PublicationTargetService } from '../../publishing/publishing-target.service';

/**
 * Dynamic MCP mutations still need the same native authorization decision before
 * their reviewed proposal is staged. This helper performs only lookups and
 * permission checks; the owning GraphQL resolver and service remain responsible
 * for the eventual domain operation.
 */
export const DYNAMIC_ADMIN_MCP_ADMISSION_FIELDS = new Set([
  'blockContentReviewEditing',
  'decideContentReview',
  'setPublicationState',
  'runPublicationBulkOperation',
  'approveTicketPurchase',
  'rejectTicketPurchase',
  'revertAuditLogEntry',
  'saveTicketConfig',
  'saveEventForm',
  'saveEventFormDraft',
  'savePrizeDraw',
  'savePermissionRole',
  'savePermissionGroup',
  'updateEventMaterials',
  'approveOfflineEventAttendanceSubmission',
  'approveOfflineEventAttendanceSubmissions',
  'rejectOfflineEventAttendanceSubmission',
  'rejectOfflineEventAttendanceSubmissions',
  'updateOfflineEventAttendanceSubmission',
  'requestCertificateIssuance',
]);

export type AdmissionServices = {
  prisma: PrismaService;
  policy: AuthorizationPolicyService;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BadRequestException(`${label} inválido.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`${label} inválido.`);
  }
  return value;
}

async function assertAnyPermission(
  policy: AuthorizationPolicyService,
  user: AuthenticatedUser,
  permissions: readonly Permission[],
  context: Parameters<AuthorizationPolicyService['assertPermissions']>[2],
): Promise<void> {
  for (const permission of permissions) {
    try {
      await policy.assertPermissions(user, [permission], context);
      return;
    } catch (error: unknown) {
      if (!(error instanceof ForbiddenException)) throw error;
    }
  }
  throw new ForbiddenException('Sem permissão para esta operação e destino.');
}

async function assertContentReviewAdmission(
  field: 'blockContentReviewEditing' | 'decideContentReview',
  args: Record<string, unknown>,
  user: AuthenticatedUser,
  { prisma, policy }: AdmissionServices,
): Promise<void> {
  if (field === 'blockContentReviewEditing') {
    await policy.assertPermissions(user, [Permission.Person.Update]);
  }

  const id = requiredString(args['id'], 'id');
  const review = await prisma.contentReview.findUnique({
    where: { id },
    select: { eventId: true },
  });
  if (!review) throw new NotFoundException('Esta revisão não está mais pendente.');

  await assertAnyPermission(
    policy,
    user,
    review.eventId
      ? [Permission.EventMaterials.Review, Permission.Event.Update]
      : [Permission.LecturerProfile.Review, Permission.Person.Update],
    review.eventId ? { eventId: review.eventId } : {},
  );
}

function publicationUpdatePermission(targetType: PublicationTargetType): Permission {
  if (targetType === PublicationTargetType.EVENT_GROUP) return Permission.EventGroup.Update;
  if (targetType === PublicationTargetType.MAJOR_EVENT) return Permission.MajorEvent.Update;
  return Permission.Event.Update;
}

async function assertPublicationAdmission(
  field: 'setPublicationState' | 'runPublicationBulkOperation',
  args: Record<string, unknown>,
  user: AuthenticatedUser,
  { prisma, policy }: AdmissionServices,
): Promise<void> {
  const input = record(args['input'], 'input');
  const targetType = input['targetType'] as PublicationTargetType;
  const targetId = requiredString(input['targetId'], 'targetId');

  await assertPublicationTargetPermission(policy, user, targetType, targetId, publicationUpdatePermission(targetType));

  const writesChildEvents =
    field === 'setPublicationState'
      ? targetType === PublicationTargetType.EVENT_GROUP
      : targetType !== PublicationTargetType.EVENT;
  if (!writesChildEvents) return;

  const childContext =
    targetType === PublicationTargetType.MAJOR_EVENT ? { majorEventId: targetId } : { eventGroupId: targetId };
  await policy.assertPermissions(user, [Permission.Event.Update], childContext);

  const targetService = new PublicationTargetService(prisma);
  const eventIds =
    field === 'setPublicationState'
      ? await targetService.resolveChildEventIds(targetType, targetId, { requireChildren: true })
      : await targetService.resolveChildEventIds(
          targetType,
          targetId,
          input['operation'] === PublicationBulkOperation.PUBLISH_MISSING_CHILDREN
            ? { onlyMissingPublication: true }
            : { includeTargetEvent: true },
        );

  for (const eventId of eventIds) {
    await policy.assertPermissions(user, [Permission.Event.Update], { eventId });
  }
}

async function assertTicketPurchaseAdmission(
  field: 'approveTicketPurchase' | 'rejectTicketPurchase',
  args: Record<string, unknown>,
  user: AuthenticatedUser,
  { prisma, policy }: AdmissionServices,
): Promise<void> {
  const purchaseId = requiredString(args['purchaseId'], 'purchaseId');
  const purchase = await prisma.ticketPurchase.findUnique({
    where: { id: purchaseId },
    select: { majorEventId: true },
  });
  if (!purchase) throw new NotFoundException('Compra de bilhete não encontrada.');
  await policy.assertPermissions(
    user,
    [field === 'approveTicketPurchase' ? Permission.Receipt.Approve : Permission.Receipt.Reject],
    { majorEventId: purchase.majorEventId },
  );
}

async function assertAuditRevertAdmission(
  args: Record<string, unknown>,
  user: AuthenticatedUser,
  { policy }: AdmissionServices,
): Promise<void> {
  const input = record(args['input'], 'input');
  requiredString(input['entryId'], 'entryId');
  if (!policy.isSuperAdmin(user)) {
    throw new ForbiddenException('Esta operação exige a função super-admin.');
  }
}

async function assertTicketConfigAdmission(
  args: Record<string, unknown>,
  user: AuthenticatedUser,
  { prisma, policy }: AdmissionServices,
): Promise<void> {
  const input = record(args['input'], 'input');
  const eventId = requiredString(input['eventId'], 'eventId');
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) throw new NotFoundException('Evento não encontrado.');
  const existing = await prisma.ticketConfig.findUnique({
    where: { eventId },
    select: { id: true },
  });
  await policy.assertPermissions(user, [existing ? Permission.TicketConfig.Update : Permission.TicketConfig.Create], {
    eventId,
  });
}

async function assertEventFormAdmission(
  field: 'saveEventForm' | 'saveEventFormDraft',
  args: Record<string, unknown>,
  user: AuthenticatedUser,
  { prisma, policy }: AdmissionServices,
): Promise<void> {
  if (field === 'saveEventFormDraft') {
    const input = record(args['input'], 'input');
    const form = await requireEventForm(prisma, requiredString(input['sourceFormId'], 'sourceFormId'));
    await policy.assertPermissions(user, [Permission.EventForm.Update], { eventFormId: form.id });
    return;
  }

  const input = record(args['input'], 'input') as unknown as EventFormInput;
  const permission = input.id ? Permission.EventForm.Update : Permission.EventForm.Create;
  if (input.id) {
    const form = await requireEventForm(prisma, input.id);
    await policy.assertPermissions(user, [Permission.EventForm.Update], { eventFormId: form.id });
    await assertCanManageLinkedTargets(policy, user, [formOwnerTargetInput(form)], Permission.EventForm.Update);
    await assertCanManageLinkedTargets(policy, user, [ownerTargetInput(normalizeOwner(input))], permission);
    if (input.links !== undefined && input.links !== null) {
      await assertCanManageLinkedTargets(
        policy,
        user,
        manageableLinksForReplace(form.links, input.links),
        Permission.EventForm.Update,
      );
    }
    return;
  }

  const target = normalizeOwner(input);
  await policy.assertPermissions(user, [Permission.EventForm.Create], {
    eventId: target.ownerEventId ?? undefined,
    majorEventId: target.ownerMajorEventId ?? undefined,
    allowScopedCollection: true,
  });
  await assertCanManageLinkedTargets(policy, user, input.links ?? [], Permission.EventForm.Create);
}

async function assertPrizeDrawAdmission(
  args: Record<string, unknown>,
  user: AuthenticatedUser,
  { prisma, policy }: AdmissionServices,
): Promise<void> {
  const input = record(args['input'], 'input');
  const existing = input['id']
    ? await prisma.prizeDraw.findFirst({
        where: { id: requiredString(input['id'], 'id'), deletedAt: null },
        select: { id: true },
      })
    : null;
  if (input['id'] && !existing) throw new NotFoundException('Sorteio não encontrado.');

  const isEventTarget = input['targetType'] === PrizeDrawTargetType.EVENT;
  const target = isEventTarget
    ? { eventId: requiredString(input['eventId'], 'eventId') }
    : { majorEventId: requiredString(input['majorEventId'], 'majorEventId') };
  const writePermission = existing ? Permission.PrizeDraw.Update : Permission.PrizeDraw.Create;

  if (existing) {
    await policy.assertPermissions(user, [Permission.PrizeDraw.Update], { prizeDrawId: existing.id });
  }
  await policy.assertPermissions(user, [writePermission], target);

  const manualEntries = Array.isArray(input['manualEntries']) ? input['manualEntries'] : [];
  const weightOverrides = Array.isArray(input['weightOverrides']) ? input['weightOverrides'] : [];
  const excludedPersonIds = Array.isArray(input['excludedPersonIds']) ? input['excludedPersonIds'] : [];
  if (manualEntries.length || weightOverrides.length || excludedPersonIds.length) {
    await policy.assertPermissions(user, [Permission.RelatedPerson.Read], target);
  }
}

async function assertOfflineAttendanceAdmission(
  field:
    | 'approveOfflineEventAttendanceSubmission'
    | 'approveOfflineEventAttendanceSubmissions'
    | 'rejectOfflineEventAttendanceSubmission'
    | 'rejectOfflineEventAttendanceSubmissions'
    | 'updateOfflineEventAttendanceSubmission',
  args: Record<string, unknown>,
  user: AuthenticatedUser,
  { prisma, policy }: AdmissionServices,
): Promise<void> {
  const submissionIds = field.endsWith('Submissions') ? args['submissionIds'] : [args['submissionId']];
  if (!Array.isArray(submissionIds)) throw new BadRequestException('Selecione ao menos uma presença off-line.');

  const isBulk = field.endsWith('Submissions');
  const ids = isBulk
    ? [...new Set(submissionIds.map((id) => requiredString(id, 'submissionId').trim()))]
    : [requiredString(submissionIds[0], 'submissionId')];
  if (ids.length === 0) throw new BadRequestException('Selecione ao menos uma presença off-line.');
  const submissions = await prisma.offlineEventAttendanceSubmission.findMany({
    where: { id: { in: ids } },
    select: { id: true, eventId: true },
  });
  if (submissions.length !== ids.length) throw new NotFoundException('Uma presença off-line não foi encontrada.');

  for (const submission of submissions) {
    await policy.assertPermissions(user, [Permission.EventAttendance.Update], { eventId: submission.eventId });
  }
}

async function assertCertificateIssuanceAdmission(
  args: Record<string, unknown>,
  user: AuthenticatedUser,
  { prisma, policy }: AdmissionServices,
): Promise<void> {
  const input = record(args['input'], 'input');
  const configId = requiredString(input['configId'], 'configId').trim();
  const config = await prisma.certificateConfig.findFirst({
    where: { id: configId, deletedAt: null },
    select: { id: true, scope: true, eventId: true, eventGroupId: true, majorEventId: true, folderId: true },
  });
  if (!config) throw new NotFoundException(`Certificate config ${configId} not found.`);

  const targetId =
    config.scope === CertificateScope.EVENT
      ? config.eventId
      : config.scope === CertificateScope.EVENT_GROUP
        ? config.eventGroupId
        : config.scope === CertificateScope.MAJOR_EVENT
          ? config.majorEventId
          : config.scope === CertificateScope.OTHER
            ? config.folderId
            : null;
  const context = {
    scope: config.scope,
    targetId: targetId ?? '',
    certificateConfigId: config.id,
  };
  await policy.assertPermissions(user, [Permission.Certificate.Issue], context);
  if (input['reissue'] === true) {
    await policy.assertPermissions(user, [Permission.Certificate.Reissue], context);
  }
}

export async function assertDynamicAdminMcpAdmission(
  field: string,
  args: Record<string, unknown>,
  user: AuthenticatedUser,
  services: AdmissionServices,
): Promise<void> {
  switch (field) {
    case 'blockContentReviewEditing':
    case 'decideContentReview':
      return assertContentReviewAdmission(field, args, user, services);
    case 'setPublicationState':
    case 'runPublicationBulkOperation':
      return assertPublicationAdmission(field, args, user, services);
    case 'approveTicketPurchase':
    case 'rejectTicketPurchase':
      return assertTicketPurchaseAdmission(field, args, user, services);
    case 'revertAuditLogEntry':
      return assertAuditRevertAdmission(args, user, services);
    case 'saveTicketConfig':
      return assertTicketConfigAdmission(args, user, services);
    case 'saveEventForm':
    case 'saveEventFormDraft':
      return assertEventFormAdmission(field, args, user, services);
    case 'savePrizeDraw':
      return assertPrizeDrawAdmission(args, user, services);
    case 'savePermissionRole':
    case 'savePermissionGroup': {
      const input = record(args['input'], 'input');
      const permission = input['id'] ? Permission.PermissionGrant.Update : Permission.PermissionGrant.Create;
      await services.policy.assertPermissions(
        user,
        [permission],
        services.policy.buildResourceContext(args, [permission]),
      );
      return;
    }
    case 'updateEventMaterials': {
      const permissions = [Permission.Event.Update];
      await services.policy.assertPermissions(
        user,
        permissions,
        services.policy.buildResourceContext(args, permissions),
      );
      return;
    }
    case 'approveOfflineEventAttendanceSubmission':
    case 'approveOfflineEventAttendanceSubmissions':
    case 'rejectOfflineEventAttendanceSubmission':
    case 'rejectOfflineEventAttendanceSubmissions':
    case 'updateOfflineEventAttendanceSubmission':
      return assertOfflineAttendanceAdmission(field, args, user, services);
    case 'requestCertificateIssuance':
      return assertCertificateIssuanceAdmission(args, user, services);
    default:
      throw new ForbiddenException('Esta operação dinâmica não tem admissão autorizada.');
  }
}
