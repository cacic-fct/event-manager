import { Injectable, Logger } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { ANONYMOUS_AUDIENCE, type EventAudiencePrincipal } from './audience-context';
import { BackendFeatureFlagService } from '../feature-flags/backend-feature-flags';
import { hasUnespEmail, resolveAudienceIdentity } from './audience-identity';
import { AccountManagerGrpcClient } from '../grpc/account-manager-grpc.client';
import type { M2MUserIdentifierLookupMatch } from '@cacic-fct/account-manager-m2m-contracts';

export function isUnespAudience(primaryEmail: unknown, secondaryEmails: readonly unknown[] = []): boolean {
  return hasUnespEmail([primaryEmail, ...secondaryEmails]);
}

@Injectable()
export class EventAudienceService {
  private readonly logger = new Logger(EventAudienceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly featureFlags: BackendFeatureFlagService,
    private readonly accountManager?: AccountManagerGrpcClient,
  ) {}

  async principalForUser(user?: AuthenticatedUser): Promise<EventAudiencePrincipal> {
    if (!user?.sub) return ANONYMOUS_AUDIENCE;
    const userId = user.sub;
    const people = await this.prisma.people.findMany({
      where: { userId, deletedAt: null, mergedIntoId: null },
      select: { id: true },
    });
    const identity = await this.resolveSignedIdentity(user);
    return {
      userId,
      personIds: people.map((person) => person.id),
      isUnesp: identity.isUnesp,
      verifiedCourseCode: identity.verifiedCourseCode,
      bypass: (await this.authorization.evaluateGlobalPermissions(user, [Permission.EventAudience.Bypass])).includes(
        Permission.EventAudience.Bypass,
      ),
    };
  }

  async principalForStoredUser(userId: string): Promise<EventAudiencePrincipal> {
    const [user, people] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
      this.prisma.people.findMany({
        where: { userId, deletedAt: null, mergedIntoId: null },
        select: { id: true },
      }),
    ]);
    const accountProfile = user?.email ? await this.lookupAccountProfile(user.email, userId) : null;
    const identity = accountProfile
      ? resolveAudienceIdentity(
          {
            email: accountProfile.email ?? user?.email,
            claims: {
              email: accountProfile.email ?? user?.email,
              secondary_emails: accountProfile.secondaryEmails ?? [],
              enrollment_number: accountProfile.enrollmentNumber,
              unesp_role: accountProfile.unespRole,
              unesp_role_verified: accountProfile.unespRoleVerified,
            },
          },
          this.featureFlags.isEnabled('undergraduateUnespRoleVerificationDisabled'),
        )
      : { isUnesp: false, verifiedCourseCode: null };
    return {
      userId,
      personIds: people.map((person) => person.id),
      isUnesp: identity.isUnesp,
      verifiedCourseCode: identity.verifiedCourseCode,
      bypass: false,
    };
  }

  private async resolveSignedIdentity(user: AuthenticatedUser): Promise<ReturnType<typeof resolveAudienceIdentity>> {
    const verificationDisabled = this.featureFlags.isEnabled('undergraduateUnespRoleVerificationDisabled');
    const directIdentity = resolveAudienceIdentity(user, verificationDisabled);
    if (directIdentity.isUnesp && directIdentity.verifiedCourseCode) {
      return directIdentity;
    }

    const email = user.email ?? (typeof user.claims['email'] === 'string' ? user.claims['email'] : undefined);
    if (!this.accountManager || !email) {
      return directIdentity;
    }

    const accountProfile = await this.lookupAccountProfile(email, user.sub ?? '');
    if (!accountProfile) {
      return directIdentity;
    }

    const claims: Record<string, unknown> = {
      ...user.claims,
      email: accountProfile.email ?? email,
      secondary_emails: accountProfile.secondaryEmails ?? user.claims['secondary_emails'],
    };
    const hasAnySignedCourseClaim =
      user.claims['enrollment_number'] !== undefined ||
      user.claims['enrollmentNumber'] !== undefined ||
      user.claims['unesp_role'] !== undefined ||
      user.claims['unespRole'] !== undefined ||
      user.claims['unesp_role_verified'] !== undefined ||
      user.claims['unespRoleVerified'] !== undefined;
    if (!hasAnySignedCourseClaim) {
      claims.enrollment_number = accountProfile.enrollmentNumber;
      claims.unesp_role = accountProfile.unespRole;
      claims.unesp_role_verified = accountProfile.unespRoleVerified;
    }
    return resolveAudienceIdentity({ email: user.email ?? email, claims }, verificationDisabled);
  }

  private async lookupAccountProfile(email: string, expectedUserId: string): Promise<M2MUserIdentifierLookupMatch | null> {
    if (!this.accountManager) {
      return null;
    }

    try {
      const matches = await this.accountManager.lookupUsersByEmail(email);
      return matches.find((match) => match.userId === expectedUserId) ?? null;
    } catch (error: unknown) {
      // Audience resolution should remain fail closed when Account Manager is
      // unavailable; public browsing must not become a 503 dependency.
      this.logger.warn(
        `Account Manager audience lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
