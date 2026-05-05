import { CertificateScope } from '@cacic-eventos/shared-data-types';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type ScopeTargets = {
  majorEventId?: string | null;
  eventGroupId?: string | null;
  eventId?: string | null;
};

@Injectable()
export class CertificateValidationService {
  normalizeRequiredId(fieldName: string, rawValue: string): string {
    const value = rawValue.trim();
    if (!value) {
      throw new BadRequestException(`${fieldName} cannot be empty.`);
    }

    return value;
  }

  normalizeOptionalId(rawValue?: string | null): string | undefined {
    if (rawValue == null) {
      return undefined;
    }

    const value = rawValue.trim();
    return value || undefined;
  }

  normalizeRequiredName(rawValue: string): string {
    const value = rawValue.trim();
    if (!value) {
      throw new BadRequestException('Config name cannot be empty.');
    }

    return value;
  }

  normalizeOptionalText(rawValue?: string | null): string | null | undefined {
    if (rawValue === undefined) {
      return undefined;
    }

    if (rawValue === null) {
      return null;
    }

    const value = rawValue.trim();
    return value.length > 0 ? value : null;
  }

  normalizeCertificateFieldsJson(
    rawValue?: string | null,
  ): Prisma.InputJsonValue | null | undefined {
    if (rawValue === undefined) {
      return undefined;
    }

    if (rawValue === null) {
      return null;
    }

    const normalized = rawValue.trim();
    if (!normalized) {
      return null;
    }

    try {
      return JSON.parse(normalized) as Prisma.InputJsonValue;
    } catch {
      throw new BadRequestException(
        'certificateFieldsJson must be valid JSON.',
      );
    }
  }

  assertSupportedScope(scope: CertificateScope): void {
    if (scope === CertificateScope.OTHER) {
      throw new BadRequestException(
        'Certificate scope OTHER is not supported for issuing operations.',
      );
    }
  }

  assertScopeTargetConsistency(
    scope: CertificateScope,
    targets: ScopeTargets,
  ): void {
    this.assertSupportedScope(scope);
    const hasMajorEventId = Boolean(targets.majorEventId);
    const hasEventGroupId = Boolean(targets.eventGroupId);
    const hasEventId = Boolean(targets.eventId);

    if (scope === CertificateScope.MAJOR_EVENT) {
      if (!hasMajorEventId || hasEventGroupId || hasEventId) {
        throw new BadRequestException(
          'MAJOR_EVENT scope requires majorEventId and forbids eventGroupId/eventId.',
        );
      }
      return;
    }

    if (scope === CertificateScope.EVENT_GROUP) {
      if (!hasEventGroupId || hasMajorEventId || hasEventId) {
        throw new BadRequestException(
          'EVENT_GROUP scope requires eventGroupId and forbids majorEventId/eventId.',
        );
      }
      return;
    }

    if (scope === CertificateScope.EVENT) {
      if (!hasEventId || hasMajorEventId || hasEventGroupId) {
        throw new BadRequestException(
          'EVENT scope requires eventId and forbids majorEventId/eventGroupId.',
        );
      }
    }
  }
}
