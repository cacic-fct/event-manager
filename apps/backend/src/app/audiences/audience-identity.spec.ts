import {
  courseCodeFromEnrollment,
  isExplicitlyVerified,
  resolveAudienceIdentity,
} from './audience-identity';

describe('audience identity', () => {
  it('recognizes the supported undergraduate course from a verified Keycloak claim', () => {
    expect(
      resolveAudienceIdentity(
        {
          email: 'student@example.com',
          claims: {
            secondary_emails: ['student@unesp.br'],
            unesp_role: ['aluno-graduacao'],
            enrollment_number: '00123456',
            unesp_role_verified: 'true',
          },
        },
        false,
      ),
    ).toEqual({ isUnesp: true, verifiedCourseCode: '12' });
  });

  it('uses the Account Manager kill switch only to waive undergraduate verification', () => {
    const user = {
      email: 'student@unesp.br',
      claims: {
        unesp_role: 'aluno-graduacao',
        enrollment_number: '24123456',
        unesp_role_verified: 'false',
      },
    };

    expect(resolveAudienceIdentity(user, false).verifiedCourseCode).toBeNull();
    expect(resolveAudienceIdentity(user, true).verifiedCourseCode).toBe('12');
  });

  it('does not infer affiliation or course access from an unverified or unsupported profile', () => {
    expect(
      resolveAudienceIdentity(
        {
          email: 'student@gmail.com',
          claims: {
            secondary_emails: ['personal@example.com'],
            unesp_role: 'aluno-graduacao',
            enrollment_number: '00261234',
            unesp_role_verified: true,
          },
        },
        true,
      ),
    ).toEqual({ isUnesp: false, verifiedCourseCode: null });
  });

  it('matches the established numeric enrollment segment and rejects short values', () => {
    expect(courseCodeFromEnrollment('00123456')).toBe('12');
    expect(courseCodeFromEnrollment('202612345678901234')).toBe('26');
    expect(courseCodeFromEnrollment('12')).toBeNull();
  });

  it('accepts only explicit true verification values', () => {
    expect(isExplicitlyVerified(' true ')).toBe(true);
    expect(isExplicitlyVerified(['false', 'true'])).toBe(true);
    expect(isExplicitlyVerified('yes')).toBe(false);
  });
});
