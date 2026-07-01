import {
  EVENT_MANAGER_PERMISSION_CATALOG,
  EVENT_MANAGER_PERMISSION_SET,
  EventManagerKeycloakRole,
  Permission,
  parsePermission,
  requiresGlobalPermissionGrantScope,
} from '@cacic-fct/shared-permissions';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { CertificateScope, EventManagerPermissionGrantScope } from '@prisma/client';
import { addHours, isFuture, isWithinInterval, subHours } from 'date-fns';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';

export type AuthorizationResourceContext = {
  eventId?: string;
  majorEventId?: string;
  eventGroupId?: string;
  subscriptionId?: string;
  receiptId?: string;
  receiptValidationActionId?: string;
  certificateConfigId?: string;
  certificateId?: string;
  eventFormId?: string;
  eventFormLinkId?: string;
  eventFormResponseId?: string;
  scope?: string;
  targetId?: string;
  genericId?: string;
  primaryResource?: string;
  allowScopedCollection?: boolean;
};

type ResolvedGrantTarget = {
  eventIds: Set<string>;
  majorEventIds: Set<string>;
  eventGroupIds: Set<string>;
};

export type AccessibleEventGrantTargets = ResolvedGrantTarget;

type ActiveGrant = {
  permission: string;
  scope: EventManagerPermissionGrantScope;
  eventId: string | null;
  majorEventId: string | null;
  eventGroupId: string | null;
};

const ATTENDANCE_COLLECTION_PERMISSIONS = [
  Permission.EventAttendance.Collect,
  Permission.EventAttendance.Import,
  Permission.EventAttendance.Update,
] as const;

@Injectable()
export class AuthorizationPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  hasEventManagerAccess(user: AuthenticatedUser | undefined): boolean {
    return Boolean(user && (this.isSuperAdmin(user) || user.roleSet.has(EventManagerKeycloakRole.Access)));
  }

  isSuperAdmin(user: AuthenticatedUser | undefined): boolean {
    return Boolean(user?.roleSet.has(EventManagerKeycloakRole.SuperAdmin));
  }

  async assertPermissions(
    user: AuthenticatedUser | undefined,
    permissions: readonly string[],
    context: AuthorizationResourceContext = {},
  ): Promise<void> {
    const requirements = this.normalizePermissionRequirements(permissions);
    if (requirements.length === 0) {
      return;
    }

    if (!user || !this.hasEventManagerAccess(user)) {
      throw new ForbiddenException(`Missing required Keycloak role: ${EventManagerKeycloakRole.Access}.`);
    }

    const missing: string[] = [];
    for (const permission of requirements) {
      if (!(await this.hasPermission(user, permission, context))) {
        missing.push(permission);
      }
    }

    if (missing.length > 0) {
      throw new ForbiddenException(`Missing Event Manager permission grants: ${missing.join(', ')}.`);
    }
  }

  async evaluatePermissions(user: AuthenticatedUser | undefined, permissions: readonly string[]): Promise<Permission[]> {
    const requirements = this.normalizePermissions(permissions);
    if (!user || !this.hasEventManagerAccess(user)) {
      return [];
    }

    if (this.isSuperAdmin(user)) {
      return requirements;
    }

    const grants = await this.findActiveGrants(user.sub, requirements);
    const grantedPermissions = new Set(
      grants
        .filter(
          (grant) =>
            !requiresGlobalPermissionGrantScope(grant.permission as Permission) ||
            grant.scope === EventManagerPermissionGrantScope.GLOBAL,
        )
        .map((grant) => grant.permission),
    );
    return requirements.filter((permission) => grantedPermissions.has(permission));
  }

  async evaluateGlobalPermissions(user: AuthenticatedUser | undefined, permissions: readonly string[]): Promise<Permission[]> {
    const requirements = this.normalizePermissions(permissions);
    if (!user || !this.hasEventManagerAccess(user)) {
      return [];
    }

    if (this.isSuperAdmin(user)) {
      return requirements;
    }

    const grants = await this.findActiveGrants(user.sub, requirements);
    const grantedPermissions = new Set(
      grants
        .filter((grant) => grant.scope === EventManagerPermissionGrantScope.GLOBAL)
        .map((grant) => grant.permission),
    );
    return requirements.filter((permission) => grantedPermissions.has(permission));
  }

  async grantedPermissionSet(user: AuthenticatedUser | undefined): Promise<Set<Permission>> {
    if (!user || !this.hasEventManagerAccess(user)) {
      return new Set();
    }

    if (this.isSuperAdmin(user)) {
      return new Set(EVENT_MANAGER_PERMISSION_CATALOG);
    }

    const grants = await this.findActiveGrants(user.sub);
    const permissions = grants
      .filter(
        (grant) =>
          !requiresGlobalPermissionGrantScope(grant.permission as Permission) ||
          grant.scope === EventManagerPermissionGrantScope.GLOBAL,
      )
      .map((grant) => grant.permission)
      .filter((permission): permission is Permission => EVENT_MANAGER_PERMISSION_SET.has(permission as Permission));

    return new Set(permissions);
  }

  async accessibleMajorEventIds(
    user: AuthenticatedUser | undefined,
    permission: Permission,
  ): Promise<Set<string> | null> {
    if (!user || !this.hasEventManagerAccess(user)) {
      return new Set();
    }

    if (this.isSuperAdmin(user)) {
      return null;
    }

    const grants = await this.findActiveGrants(user.sub, [permission]);
    if (grants.some((grant) => grant.scope === EventManagerPermissionGrantScope.GLOBAL)) {
      return null;
    }

    return new Set(
      grants
        .filter((grant) => grant.scope === EventManagerPermissionGrantScope.MAJOR_EVENT && grant.majorEventId)
        .map((grant) => grant.majorEventId as string),
    );
  }

  async accessibleEventTargets(
    user: AuthenticatedUser | undefined,
    permission: Permission,
  ): Promise<AccessibleEventGrantTargets | null> {
    const target: AccessibleEventGrantTargets = {
      eventIds: new Set(),
      majorEventIds: new Set(),
      eventGroupIds: new Set(),
    };

    if (!user || !this.hasEventManagerAccess(user)) {
      return target;
    }

    if (this.isSuperAdmin(user)) {
      return null;
    }

    const grants = await this.findActiveGrants(user.sub, [permission]);
    if (grants.some((grant) => grant.scope === EventManagerPermissionGrantScope.GLOBAL)) {
      return null;
    }

    for (const grant of grants) {
      if (grant.scope === EventManagerPermissionGrantScope.EVENT && grant.eventId) {
        target.eventIds.add(grant.eventId);
      }
      if (grant.scope === EventManagerPermissionGrantScope.MAJOR_EVENT && grant.majorEventId) {
        target.majorEventIds.add(grant.majorEventId);
      }
      if (grant.scope === EventManagerPermissionGrantScope.EVENT_GROUP && grant.eventGroupId) {
        target.eventGroupIds.add(grant.eventGroupId);
      }
    }

    return target;
  }

  async accessibleEventGroupIds(
    user: AuthenticatedUser | undefined,
    permission: Permission,
  ): Promise<Set<string> | null> {
    if (!user || !this.hasEventManagerAccess(user)) {
      return new Set();
    }

    if (this.isSuperAdmin(user)) {
      return null;
    }

    const grants = await this.findActiveGrants(user.sub, [permission]);
    if (grants.some((grant) => grant.scope === EventManagerPermissionGrantScope.GLOBAL)) {
      return null;
    }

    return new Set(
      grants
        .filter((grant) => grant.scope === EventManagerPermissionGrantScope.EVENT_GROUP && grant.eventGroupId)
        .map((grant) => grant.eventGroupId as string),
    );
  }

  async canOverrideFrozenResource(
    user: AuthenticatedUser | undefined,
    permission: Permission,
    context: AuthorizationResourceContext = {},
  ): Promise<boolean> {
    if (!user || !this.hasEventManagerAccess(user)) {
      return false;
    }

    return this.hasPermission(user, permission, context);
  }

  async assertAttendanceCollectorForEvent(
    eventId: string,
    personId: string,
    options: { enforceCollectionWindow?: boolean; user?: AuthenticatedUser } = {},
  ): Promise<void> {
    const [collector, event] = await Promise.all([
      this.prisma.eventAttendanceCollector.findUnique({
        where: {
          eventId_personId: {
            eventId,
            personId,
          },
        },
        select: {
          eventId: true,
        },
      }),
      this.prisma.event.findUnique({
        where: {
          id: eventId,
        },
        select: {
          startDate: true,
          endDate: true,
          deletedAt: true,
          publiclyVisible: true,
          shouldCollectAttendance: true,
        },
      }),
    ]);

    if (
      !event ||
      event.deletedAt ||
      !event.shouldCollectAttendance
    ) {
      throw new ForbiddenException('Você não pode coletar presença para este evento.');
    }

    if (
      options.enforceCollectionWindow &&
      !this.isAttendanceCollectionOpen(event.startDate, event.endDate)
    ) {
      throw new ForbiddenException('A coleta de presença não está aberta para este evento.');
    }

    if (collector && event.publiclyVisible) {
      return;
    }

    if (await this.hasAnyPermission(options.user, ATTENDANCE_COLLECTION_PERMISSIONS, { eventId })) {
      return;
    }

    throw new ForbiddenException('Você não pode coletar presença para este evento.');
  }

  canLecturerViewSubscriberList(event: {
    endDate: Date;
    shouldProvideSubscriberListToLecturer: boolean;
  }): boolean {
    return event.shouldProvideSubscriberListToLecturer && isFuture(event.endDate);
  }

  assertLecturerCanViewSubscriberList(
    event: {
      endDate: Date;
      shouldProvideSubscriberListToLecturer: boolean;
      lecturers: readonly { personId: string }[];
    },
    personId: string,
  ): void {
    if (!this.canLecturerViewSubscriberList(event) || !event.lecturers.some((lecturer) => lecturer.personId === personId)) {
      throw new ForbiddenException('Subscriber list is not available for this event.');
    }
  }

  buildResourceContext(raw: unknown, requiredPermissions: readonly string[] = []): AuthorizationResourceContext {
    const context: AuthorizationResourceContext = {};
    this.collectResourceIds(raw, context);

    const resources = new Set(
      this.normalizePermissionRequirements(requiredPermissions).map((permission) => parsePermission(permission).resource),
    );
    if (resources.size === 1) {
      context.primaryResource = [...resources][0];
    }
    if (context.genericId && resources.has('subscription')) {
      context.subscriptionId ??= context.genericId;
    }

    return context;
  }

  private async hasPermission(
    user: AuthenticatedUser,
    permission: Permission,
    context: AuthorizationResourceContext,
  ): Promise<boolean> {
    if (this.isSuperAdmin(user)) {
      return true;
    }

    const grants = await this.findActiveGrants(user.sub, [permission]);
    if (grants.some((grant) => grant.scope === EventManagerPermissionGrantScope.GLOBAL)) {
      return true;
    }

    if (requiresGlobalPermissionGrantScope(permission)) {
      return false;
    }

    const target = await this.resolveGrantTarget(permission, context);
    if (context.allowScopedCollection && this.isEmptyGrantTarget(target)) {
      return grants.some((grant) => grant.scope !== EventManagerPermissionGrantScope.GLOBAL);
    }
    return grants.some((grant) => this.matchesScopedGrant(grant, target));
  }

  private async hasAnyPermission(
    user: AuthenticatedUser | undefined,
    permissions: readonly Permission[],
    context: AuthorizationResourceContext,
  ): Promise<boolean> {
    if (!user || !this.hasEventManagerAccess(user)) {
      return false;
    }

    for (const permission of permissions) {
      if (await this.hasPermission(user, permission, context)) {
        return true;
      }
    }

    return false;
  }

  private normalizePermissions(permissions: readonly string[]): Permission[] {
    return [...new Set(permissions)]
      .map((permission) => permission.trim())
      .filter((permission): permission is Permission => EVENT_MANAGER_PERMISSION_SET.has(permission as Permission));
  }

  private normalizePermissionRequirements(permissions: readonly string[]): Permission[] {
    if (permissions.length === 0) {
      return [];
    }

    const normalized = [...new Set(permissions.map((permission) => permission.trim()))];
    const invalidPermissions = normalized.filter(
      (permission) => !permission || !EVENT_MANAGER_PERMISSION_SET.has(permission as Permission),
    );

    if (invalidPermissions.length > 0) {
      throw new ForbiddenException(`Invalid Event Manager permission requirements: ${invalidPermissions.join(', ')}.`);
    }

    return normalized as Permission[];
  }

  private async findActiveGrants(userId: string | undefined, permissions?: readonly Permission[]): Promise<ActiveGrant[]> {
    if (!userId) {
      return [];
    }

    const now = new Date();
    return this.prisma.eventManagerPermissionGrant.findMany({
      where: {
        userId,
        deletedAt: null,
        OR: [{ validFrom: null }, { validFrom: { lte: now } }],
        AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: now } }] }],
        ...(permissions?.length ? { permission: { in: [...permissions] } } : {}),
      },
      select: {
        permission: true,
        scope: true,
        eventId: true,
        majorEventId: true,
        eventGroupId: true,
      },
    });
  }

  private async resolveGrantTarget(
    permission: Permission,
    context: AuthorizationResourceContext,
  ): Promise<ResolvedGrantTarget> {
    const target: ResolvedGrantTarget = {
      eventIds: new Set(),
      majorEventIds: new Set(),
      eventGroupIds: new Set(),
    };

    if (await this.addAuthoritativeResourceTarget(target, permission, context)) {
      return target;
    }

    if (context.eventId) {
      await this.addEventTarget(target, context.eventId);
    }

    if (context.majorEventId) {
      target.majorEventIds.add(context.majorEventId);
    }

    if (context.eventGroupId) {
      target.eventGroupIds.add(context.eventGroupId);
    }

    if (context.subscriptionId) {
      await this.addSubscriptionTarget(target, context.subscriptionId);
    }

    if (context.receiptId) {
      await this.addReceiptTarget(target, context.receiptId);
    }

    if (context.receiptValidationActionId) {
      await this.addReceiptValidationActionTarget(target, context.receiptValidationActionId);
    }

    if (context.certificateConfigId) {
      await this.addCertificateConfigTarget(target, context.certificateConfigId);
    }

    if (context.certificateId) {
      await this.addCertificateTarget(target, context.certificateId);
    }

    if (context.eventFormId) {
      await this.addEventFormTarget(target, context.eventFormId);
    }

    if (context.eventFormLinkId) {
      await this.addEventFormLinkTarget(target, context.eventFormLinkId);
    }

    if (context.eventFormResponseId) {
      await this.addEventFormResponseTarget(target, context.eventFormResponseId);
    }

    if (context.scope && context.targetId) {
      await this.addCertificateScopeTarget(target, context.scope, context.targetId);
    }

    return target;
  }

  private async addAuthoritativeResourceTarget(
    target: ResolvedGrantTarget,
    permission: Permission,
    context: AuthorizationResourceContext,
  ): Promise<boolean> {
    if (!context.genericId || !context.primaryResource) {
      return false;
    }

    const resource = parsePermission(permission).resource;
    if (context.primaryResource !== resource) {
      return false;
    }

    return this.addPrimaryResourceTarget(target, resource, context.genericId);
  }

  private async addPrimaryResourceTarget(target: ResolvedGrantTarget, resource: string, id: string): Promise<boolean> {
    switch (resource) {
      case 'event':
        await this.addEventTarget(target, id);
        return true;
      case 'major-event':
        target.majorEventIds.add(id);
        return true;
      case 'event-group':
        target.eventGroupIds.add(id);
        return true;
      case 'subscription':
        await this.addSubscriptionTarget(target, id);
        return true;
      case 'receipt':
        await this.addReceiptTarget(target, id);
        return true;
      case 'certificate-config':
        await this.addCertificateConfigTarget(target, id);
        return true;
      case 'certificate':
        await this.addCertificateTarget(target, id);
        return true;
      case 'event-form':
        await this.addEventFormTarget(target, id);
        return true;
      default:
        return false;
    }
  }

  private async addEventTarget(target: ResolvedGrantTarget, eventId: string): Promise<void> {
    target.eventIds.add(eventId);
    const event = await this.prisma.event.findUnique({
      where: {
        id: eventId,
      },
      select: {
        majorEventId: true,
        eventGroupId: true,
      },
    });

    if (event?.majorEventId) {
      target.majorEventIds.add(event.majorEventId);
    }
    if (event?.eventGroupId) {
      target.eventGroupIds.add(event.eventGroupId);
    }
  }

  private async addSubscriptionTarget(target: ResolvedGrantTarget, subscriptionId: string): Promise<void> {
    const [eventSubscription, eventGroupSubscription, majorEventSubscription] = await Promise.all([
      this.prisma.eventSubscription.findUnique({
        where: {
          id: subscriptionId,
        },
        select: {
          eventId: true,
        },
      }),
      this.prisma.eventGroupSubscription.findUnique({
        where: {
          id: subscriptionId,
        },
        select: {
          eventGroupId: true,
        },
      }),
      this.prisma.majorEventSubscription.findUnique({
        where: {
          id: subscriptionId,
        },
        select: {
          majorEventId: true,
        },
      }),
    ]);

    if (eventSubscription?.eventId) {
      await this.addEventTarget(target, eventSubscription.eventId);
    }
    if (eventGroupSubscription?.eventGroupId) {
      target.eventGroupIds.add(eventGroupSubscription.eventGroupId);
    }
    if (majorEventSubscription?.majorEventId) {
      target.majorEventIds.add(majorEventSubscription.majorEventId);
    }
  }

  private async addReceiptTarget(target: ResolvedGrantTarget, receiptId: string): Promise<void> {
    const receipt = await this.prisma.majorEventReceipt.findUnique({
      where: {
        id: receiptId,
      },
      select: {
        majorEventId: true,
      },
    });

    if (receipt?.majorEventId) {
      target.majorEventIds.add(receipt.majorEventId);
    }
  }

  private async addReceiptValidationActionTarget(
    target: ResolvedGrantTarget,
    actionId: string,
  ): Promise<void> {
    const action = await this.prisma.majorEventReceiptValidationAction.findUnique({
      where: {
        id: actionId,
      },
      select: {
        subscription: {
          select: {
            majorEventId: true,
          },
        },
      },
    });

    if (action?.subscription.majorEventId) {
      target.majorEventIds.add(action.subscription.majorEventId);
    }
  }

  private async addCertificateConfigTarget(target: ResolvedGrantTarget, configId: string): Promise<void> {
    const config = await this.prisma.certificateConfig.findFirst({
      where: {
        id: configId,
        deletedAt: null,
      },
      select: {
        scope: true,
        eventId: true,
        eventGroupId: true,
        majorEventId: true,
      },
    });

    if (!config) {
      return;
    }

    await this.addCertificateScopeTarget(
      target,
      config.scope,
      config.eventId ?? config.eventGroupId ?? config.majorEventId ?? undefined,
    );
  }

  private async addCertificateTarget(target: ResolvedGrantTarget, certificateId: string): Promise<void> {
    const certificate = await this.prisma.certificate.findFirst({
      where: {
        id: certificateId,
        deletedAt: null,
      },
      select: {
        config: {
          select: {
            scope: true,
            eventId: true,
            eventGroupId: true,
            majorEventId: true,
          },
        },
      },
    });

    if (!certificate) {
      return;
    }

    await this.addCertificateScopeTarget(
      target,
      certificate.config.scope,
      certificate.config.eventId ?? certificate.config.eventGroupId ?? certificate.config.majorEventId ?? undefined,
    );
  }

  private async addCertificateScopeTarget(
    target: ResolvedGrantTarget,
    scope: string,
    targetId: string | null | undefined,
  ): Promise<void> {
    if (!targetId) {
      return;
    }

    switch (scope) {
      case CertificateScope.EVENT:
        await this.addEventTarget(target, targetId);
        return;
      case CertificateScope.EVENT_GROUP:
        target.eventGroupIds.add(targetId);
        return;
      case CertificateScope.MAJOR_EVENT:
        target.majorEventIds.add(targetId);
    }
  }

  private async addEventFormTarget(target: ResolvedGrantTarget, formId: string): Promise<void> {
    const form = await this.prisma.eventForm.findFirst({
      where: {
        id: formId,
        deletedAt: null,
      },
      select: {
        ownerEventId: true,
        ownerMajorEventId: true,
        links: {
          where: {
            deletedAt: null,
          },
          select: {
            eventId: true,
            majorEventId: true,
          },
        },
      },
    });

    if (!form) {
      return;
    }

    if (form.ownerEventId) {
      await this.addEventTarget(target, form.ownerEventId);
    }
    if (form.ownerMajorEventId) {
      target.majorEventIds.add(form.ownerMajorEventId);
    }
    for (const link of form.links) {
      if (link.eventId) {
        await this.addEventTarget(target, link.eventId);
      }
      if (link.majorEventId) {
        target.majorEventIds.add(link.majorEventId);
      }
    }
  }

  private async addEventFormLinkTarget(target: ResolvedGrantTarget, linkId: string): Promise<void> {
    const link = await this.prisma.eventFormLink.findFirst({
      where: {
        id: linkId,
        deletedAt: null,
      },
      select: {
        eventId: true,
        majorEventId: true,
        formId: true,
      },
    });

    if (!link) {
      return;
    }

    if (link.eventId) {
      await this.addEventTarget(target, link.eventId);
    }
    if (link.majorEventId) {
      target.majorEventIds.add(link.majorEventId);
    }
    await this.addEventFormTarget(target, link.formId);
  }

  private async addEventFormResponseTarget(target: ResolvedGrantTarget, responseId: string): Promise<void> {
    const response = await this.prisma.eventFormResponse.findUnique({
      where: {
        id: responseId,
      },
      select: {
        formId: true,
        eventId: true,
        majorEventId: true,
      },
    });

    if (!response) {
      return;
    }

    if (response.eventId) {
      await this.addEventTarget(target, response.eventId);
    }
    if (response.majorEventId) {
      target.majorEventIds.add(response.majorEventId);
    }
    await this.addEventFormTarget(target, response.formId);
  }

  private matchesScopedGrant(grant: ActiveGrant, target: ResolvedGrantTarget): boolean {
    switch (grant.scope) {
      case EventManagerPermissionGrantScope.EVENT:
        return Boolean(grant.eventId && target.eventIds.has(grant.eventId));
      case EventManagerPermissionGrantScope.MAJOR_EVENT:
        return Boolean(grant.majorEventId && target.majorEventIds.has(grant.majorEventId));
      case EventManagerPermissionGrantScope.EVENT_GROUP:
        return Boolean(grant.eventGroupId && target.eventGroupIds.has(grant.eventGroupId));
      default:
        return false;
    }
  }

  private isEmptyGrantTarget(target: ResolvedGrantTarget): boolean {
    return target.eventIds.size === 0 && target.majorEventIds.size === 0 && target.eventGroupIds.size === 0;
  }

  private isAttendanceCollectionOpen(startDate: Date, endDate: Date): boolean {
    return isWithinInterval(new Date(), {
      start: subHours(startDate, 3),
      end: addHours(endDate, 6),
    });
  }

  private collectResourceIds(value: unknown, context: AuthorizationResourceContext): void {
    if (!value || typeof value !== 'object') {
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (typeof child === 'string' && child.trim()) {
        const id = child.trim();
        switch (key) {
          case 'id':
            context.genericId ??= id;
            break;
          case 'eventId':
          case 'sourceEventId':
            context.eventId ??= id;
            break;
          case 'majorEventId':
            context.majorEventId ??= id;
            break;
          case 'eventGroupId':
            context.eventGroupId ??= id;
            break;
          case 'subscriptionId':
            context.subscriptionId ??= id;
            break;
          case 'receiptId':
            context.receiptId ??= id;
            break;
          case 'configId':
          case 'certificateConfigId':
            context.certificateConfigId ??= id;
            break;
          case 'certificateId':
            context.certificateId ??= id;
            break;
          case 'formId':
          case 'eventFormId':
          case 'sourceFormId':
            context.eventFormId ??= id;
            break;
          case 'formLinkId':
          case 'eventFormLinkId':
            context.eventFormLinkId ??= id;
            break;
          case 'responseId':
          case 'eventFormResponseId':
            context.eventFormResponseId ??= id;
            break;
          case 'targetId':
            context.targetId ??= id;
            break;
          case 'scope':
            context.scope ??= id;
            break;
          case 'actionId':
          case 'receiptValidationActionId':
            context.receiptValidationActionId ??= id;
            break;
        }
        continue;
      }

      if (child && typeof child === 'object') {
        this.collectResourceIds(child, context);
      }
    }
  }
}
