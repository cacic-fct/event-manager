import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

export type AudienceIdentity = {
  isUnesp: boolean;
  verifiedCourseCode: string | null;
};

const UNDERGRADUATE_ROLE = 'aluno-graduacao';
const SUPPORTED_COURSE_CODE = '12';

/**
 * Account Manager maps its verified attribute to the signed
 * `unesp_role_verified` Keycloak claim. The claim is a string in the shipped
 * realm mapper, but accepting a boolean keeps token parsing type-safe for
 * callers that already decoded JSON claims.
 */
export function resolveAudienceIdentity(
  user: Pick<AuthenticatedUser, 'email' | 'claims'>,
  undergraduateVerificationDisabled: boolean,
): AudienceIdentity {
  const primaryEmail = user.email ?? user.claims['email'];
  const secondaryEmails = claimStrings(user.claims['secondary_emails']);
  const isUnesp = hasUnespEmail([primaryEmail, ...secondaryEmails]);
  const role = user.claims['unesp_role'] ?? user.claims['unespRole'];
  const enrollment = user.claims['enrollment_number'] ?? user.claims['enrollmentNumber'];
  const verified = isExplicitlyVerified(user.claims['unesp_role_verified'] ?? user.claims['unespRoleVerified']);
  const courseCode = courseCodeFromEnrollment(enrollment);

  return {
    isUnesp,
    verifiedCourseCode:
      isUnesp &&
      isUndergraduateRole(role) &&
      courseCode === SUPPORTED_COURSE_CODE &&
      (verified || undergraduateVerificationDisabled)
        ? courseCode
        : null,
  };
}

export function courseCodeFromEnrollment(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const digits = String(value).replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(2, 4) : null;
}

export function hasUnespEmail(values: readonly unknown[]): boolean {
  return values.some(
    (value) => typeof value === 'string' && value.trim().toLowerCase().endsWith('@unesp.br'),
  );
}

export function isUndergraduateRole(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === UNDERGRADUATE_ROLE;
  }

  return Array.isArray(value) && value.some((role) => isUndergraduateRole(role));
}

export function isExplicitlyVerified(value: unknown): boolean {
  if (value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true')) {
    return true;
  }

  return Array.isArray(value) && value.some((item) => isExplicitlyVerified(item));
}

function claimStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [trimmed];
      } catch {
        return [trimmed];
      }
    }
    return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
