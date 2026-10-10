import { Injectable } from '@nestjs/common';
import { Prisma, TicketSubscriptionRequirement } from '@prisma/client';
import type { AdminTicketEligibility, TicketEligibilityWarning } from '@cacic-fct/shared-ticketing';
import { courseCodeFromEnrollment, hasUnespEmail, isExplicitlyVerified, resolveAudienceIdentity } from '../audiences/audience-identity';
import { audienceContext, ANONYMOUS_AUDIENCE } from '../audiences/audience-context';
import { AccountManagerGrpcClient } from '../grpc/account-manager-grpc.client';
import { PrismaService } from '../prisma/prisma.service';
import type { M2MUserIdentifierLookupMatch } from '@cacic-fct/account-manager-m2m-contracts';
import { ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES } from '../events/attendance-eligibility';

export type TicketEligibilityResult = AdminTicketEligibility & {
  reasons: string[];
};

export type TicketEligibilityIdentitySnapshot = {
  personId: string;
  userId: string | null;
  accountManagerProfile: M2MUserIdentifierLookupMatch | null;
};

type EligibilityRule = {
  subscriptionRequirement: TicketSubscriptionRequirement;
  requiresUnesp: boolean;
  requiredAcademicIdPrefixes: readonly string[];
  requiredCourseCodes: readonly string[];
  requiresAccountManagerVerification: boolean;
  allowedPriceTierIds: readonly string[];
};

type EligibilityPurpose = 'recipient' | 'purchase';

type TicketEligibilityTransaction = Prisma.TransactionClient | PrismaService;

const WARNING_COPY: Record<TicketEligibilityWarning['code'], string> = {
  SUBSCRIPTION_REQUIRED: 'É necessário atender ao critério de inscrição definido para este bilhete.',
  UNESP_REQUIRED: 'É necessário possuir vínculo UNESP conforme os critérios deste bilhete.',
  ACADEMIC_ID_REQUIRED: 'A matrícula não atende ao prefixo exigido para este bilhete.',
  COURSE_REQUIRED: 'O curso não atende aos critérios definidos para este bilhete.',
  VERIFICATION_REQUIRED: 'A verificação da Conta do Aluno é necessária para este bilhete.',
  PRICE_TIER_REQUIRED: 'A faixa de pagamento não está entre as faixas aceitas para este bilhete.',
  TICKET_DISABLED: 'A emissão de bilhetes não está habilitada para este evento.',
  PURCHASE_DISABLED: 'Este bilhete não está disponível para compra.',
};

@Injectable()
export class TicketEligibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountManager: AccountManagerGrpcClient,
  ) {}

  /** Resolve remote verification before entering a serializable mutation transaction. */
  async prepareIdentitySnapshot(
    eventId: string,
    personId: string,
    purpose: EligibilityPurpose,
  ): Promise<TicketEligibilityIdentitySnapshot> {
    return audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
      const [event, person] = await Promise.all([
        this.prisma.event.findFirst({
          where: { id: eventId },
          select: {
            ticketConfig: {
              select: {
                recipientRequiresAccountManagerVerification: true,
                purchaseRequiresAccountManagerVerification: true,
              },
            },
          },
        }),
        this.prisma.people.findFirst({
          where: { id: personId, deletedAt: null, mergedIntoId: null },
          select: { id: true, userId: true, email: true, user: { select: { id: true, email: true } } },
        }),
      ]);
      const userId = person?.user?.id ?? person?.userId ?? null;
      const requiresVerification = purpose === 'purchase'
        ? event?.ticketConfig?.purchaseRequiresAccountManagerVerification ?? false
        : event?.ticketConfig?.recipientRequiresAccountManagerVerification ?? false;
      const profile = requiresVerification && person
        ? await this.lookupAccountManagerProfile(userId, person.user?.email ?? person.email ?? undefined)
        : null;
      return {
        personId,
        userId,
        accountManagerProfile: profile,
      };
    });
  }

  async evaluateRecipientEligibility(
    tx: TicketEligibilityTransaction,
    eventId: string,
    personId: string,
    identitySnapshot?: TicketEligibilityIdentitySnapshot,
  ): Promise<TicketEligibilityResult> {
    return this.evaluate(tx, eventId, personId, 'recipient', false, identitySnapshot);
  }

  /** Purchase eligibility is stricter than transfer policy and always requires a validated paid subscription. */
  async evaluatePurchaseEligibility(
    tx: TicketEligibilityTransaction,
    eventId: string,
    personId: string,
    identitySnapshot?: TicketEligibilityIdentitySnapshot,
  ): Promise<TicketEligibilityResult> {
    return this.evaluate(tx, eventId, personId, 'purchase', false, identitySnapshot);
  }

  async evaluateManualIssueEligibility(
    tx: TicketEligibilityTransaction,
    eventId: string,
    personId: string,
  ): Promise<TicketEligibilityResult> {
    const snapshot = await this.prepareIdentitySnapshot(eventId, personId, 'recipient');
    return this.evaluate(tx, eventId, personId, 'recipient', true, snapshot);
  }

  private async evaluate(
    tx: TicketEligibilityTransaction,
    eventId: string,
    personId: string,
    purpose: EligibilityPurpose,
    allowDisabledConfig = false,
    identitySnapshot?: TicketEligibilityIdentitySnapshot,
  ): Promise<TicketEligibilityResult> {
    return audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
      const event = await tx.event.findFirst({
        where: { id: eventId, deletedAt: null },
        select: {
          id: true,
          majorEventId: true,
          eventGroup: { select: { majorEventId: true } },
          ticketConfig: {
            select: {
              enabled: true,
              purchaseEnabled: true,
              recipientSubscriptionRequirement: true,
              recipientRequiresUnesp: true,
              recipientAcademicIdPrefixes: true,
              recipientCourseCodes: true,
              recipientRequiresAccountManagerVerification: true,
              recipientAllowedPriceTierIds: true,
              purchaseRequiresUnesp: true,
              purchaseAcademicIdPrefixes: true,
              purchaseCourseCodes: true,
              purchaseRequiresAccountManagerVerification: true,
              purchaseVisiblePriceTierIds: true,
            },
          },
        },
      });
      if (!event?.ticketConfig) {
        return this.result([{ code: 'TICKET_DISABLED' }]);
      }

      const rule: EligibilityRule = purpose === 'recipient'
        ? {
            subscriptionRequirement: event.ticketConfig.recipientSubscriptionRequirement,
            requiresUnesp: event.ticketConfig.recipientRequiresUnesp,
            requiredAcademicIdPrefixes: event.ticketConfig.recipientAcademicIdPrefixes,
            requiredCourseCodes: event.ticketConfig.recipientCourseCodes,
            requiresAccountManagerVerification: event.ticketConfig.recipientRequiresAccountManagerVerification,
            allowedPriceTierIds: event.ticketConfig.recipientAllowedPriceTierIds,
          }
        : {
            subscriptionRequirement: TicketSubscriptionRequirement.REQUIRED,
            requiresUnesp: event.ticketConfig.purchaseRequiresUnesp,
            requiredAcademicIdPrefixes: event.ticketConfig.purchaseAcademicIdPrefixes,
            requiredCourseCodes: event.ticketConfig.purchaseCourseCodes,
            requiresAccountManagerVerification: event.ticketConfig.purchaseRequiresAccountManagerVerification,
            allowedPriceTierIds: event.ticketConfig.purchaseVisiblePriceTierIds,
          };

      const result: EligibilityReason[] = [];
      if (!event.ticketConfig.enabled && !allowDisabledConfig) result.push({ code: 'TICKET_DISABLED' });
      if (purpose === 'purchase' && !event.ticketConfig.purchaseEnabled) result.push({ code: 'PURCHASE_DISABLED' });

      const majorEventId = event.majorEventId ?? event.eventGroup?.majorEventId ?? null;
      const subscription = await this.findSubscription(tx, eventId, majorEventId, personId);
      if (purpose === 'purchase') {
        if (
          !subscription.majorEvent ||
          subscription.majorEvent.subscriptionStatus !== 'CONFIRMED' ||
          !subscription.majorEvent.receiptValidatedAt
        ) {
          result.push({ code: 'SUBSCRIPTION_REQUIRED' });
        }
      } else if (rule.subscriptionRequirement === TicketSubscriptionRequirement.REQUIRED && !subscription.exists) {
        result.push({ code: 'SUBSCRIPTION_REQUIRED' });
      } else if (rule.subscriptionRequirement === TicketSubscriptionRequirement.NONE && subscription.exists) {
        result.push({ code: 'SUBSCRIPTION_REQUIRED' });
      }

      const person = await tx.people.findFirst({
        where: { id: personId, deletedAt: null, mergedIntoId: null },
        select: {
          id: true,
          email: true,
          secondaryEmails: true,
          academicId: true,
          userId: true,
          user: { select: { id: true, email: true, academicId: true } },
        },
      });
      if (!person) return this.result([...result, { code: 'VERIFICATION_REQUIRED' }]);

      const matchingIdentitySnapshot = identitySnapshot?.personId === person.id &&
        identitySnapshot.userId === (person.user?.id ?? person.userId)
        ? identitySnapshot
        : undefined;
      const accountProfile = rule.requiresAccountManagerVerification
        ? matchingIdentitySnapshot?.accountManagerProfile ?? null
        : null;
      const directEmailValues = [person.email, person.user?.email, ...person.secondaryEmails];
      const directIsUnesp = hasUnespEmail(directEmailValues);
      const signedIdentity = accountProfile
        ? resolveAudienceIdentity(
            {
              email: accountProfile.email ?? person.user?.email ?? person.email ?? undefined,
              claims: {
                email: accountProfile.email ?? person.user?.email ?? person.email ?? undefined,
                secondary_emails: accountProfile.secondaryEmails ?? [],
                enrollment_number: accountProfile.enrollmentNumber,
                unesp_role: accountProfile.unespRole,
                unesp_role_verified: accountProfile.unespRoleVerified,
              },
            },
            false,
          )
        : { isUnesp: false, verifiedCourseCode: null };
      const accountVerified = Boolean(
        accountProfile && isExplicitlyVerified(accountProfile.unespRoleVerified),
      );

      if (rule.requiresAccountManagerVerification && !accountVerified) {
        result.push({ code: 'VERIFICATION_REQUIRED' });
      }
      if (rule.requiresUnesp && !(rule.requiresAccountManagerVerification ? signedIdentity.isUnesp : directIsUnesp)) {
        result.push({ code: 'UNESP_REQUIRED' });
      }

      if (rule.requiredAcademicIdPrefixes.length > 0) {
        const enrollment = rule.requiresAccountManagerVerification
          ? accountProfile?.enrollmentNumber
          : person.academicId ?? person.user?.academicId;
        const normalizedEnrollment = enrollment?.trim().normalize('NFKC').toLocaleUpperCase('pt-BR') ?? '';
        const matchesPrefix = rule.requiredAcademicIdPrefixes.some((prefix) =>
          normalizedEnrollment.startsWith(prefix.trim().normalize('NFKC').toLocaleUpperCase('pt-BR')),
        );
        if (!matchesPrefix) result.push({ code: 'ACADEMIC_ID_REQUIRED' });
      }

      if (rule.requiredCourseCodes.length > 0) {
        const courseCode = rule.requiresAccountManagerVerification
          ? signedIdentity.verifiedCourseCode
          : courseCodeFromEnrollment(person.academicId ?? person.user?.academicId);
        if (!courseCode || !rule.requiredCourseCodes.includes(courseCode)) {
          result.push({ code: 'COURSE_REQUIRED' });
        }
      }

      if (rule.allowedPriceTierIds.length > 0) {
        const paymentTier = subscription.majorEvent?.paymentTier;
        const selectedTier = paymentTier && majorEventId
          ? await this.findPriceTier(tx, majorEventId, paymentTier)
          : null;
        if (!selectedTier || !rule.allowedPriceTierIds.includes(selectedTier.id)) {
          result.push({ code: 'PRICE_TIER_REQUIRED' });
        }
      }

      return this.result(result);
    });
  }

  private async findSubscription(
    tx: TicketEligibilityTransaction,
    eventId: string,
    majorEventId: string | null,
    personId: string,
  ): Promise<{
    exists: boolean;
    majorEvent: { subscriptionStatus: string; receiptValidatedAt: Date | null; paymentTier: string | null } | null;
  }> {
    if (majorEventId) {
      const majorEvent = await tx.majorEventSubscription.findFirst({
        where: {
          majorEventId,
          personId,
          deletedAt: null,
          subscriptionStatus: { in: [...ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES] },
        },
        select: { subscriptionStatus: true, receiptValidatedAt: true, paymentTier: true },
      });
      return { exists: Boolean(majorEvent), majorEvent };
    }
    const event = await tx.eventSubscription.findFirst({
      where: { eventId, personId, deletedAt: null },
      select: { id: true },
    });
    return { exists: Boolean(event), majorEvent: null };
  }

  private async findPriceTier(
    tx: TicketEligibilityTransaction,
    majorEventId: string,
    paymentTier: string,
  ): Promise<{ id: string } | null> {
    const tiers = await tx.priceTier.findMany({
      where: { price: { majorEventId } },
      select: { id: true, name: true },
    });
    const normalizedTier = paymentTier.trim().toLocaleLowerCase('pt-BR');
    return tiers.find((tier) => tier.name.trim().toLocaleLowerCase('pt-BR') === normalizedTier) ?? null;
  }

  private async lookupAccountManagerProfile(userId: string | null | undefined, email: string | null | undefined) {
    if (!userId || !email) return null;
    const users = await this.accountManager.lookupUsersByEmail(email);
    return users.find((user) => user.userId === userId) ?? null;
  }

  private result(reasons: readonly EligibilityReason[]): TicketEligibilityResult {
    const seen = new Set<TicketEligibilityWarning['code']>();
    const warnings = reasons
      .filter(({ code }) => {
        if (seen.has(code)) return false;
        seen.add(code);
        return true;
      })
      .map(({ code }) => ({ code, message: WARNING_COPY[code] }));
    return {
      eligible: warnings.length === 0,
      reasons: warnings.map(({ code }) => code),
      warnings,
    };
  }
}

type EligibilityReason = { code: TicketEligibilityWarning['code'] };
