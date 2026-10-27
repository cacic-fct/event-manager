import { certificateStatusCopy } from './certificate-status';
import type { CertificateParticipationStatus } from '@cacic-fct/event-manager-public-contracts';

describe('certificateStatusCopy', () => {
  it('only describes attendance as confirmed when issuance eligibility confirms it', () => {
    expect(certificateStatusCopy({ status: 'ATTENDANCE_CONFIRMED' }).description).toBe(
      'Suas presenças estão confirmadas. O certificado aguarda a liberação da organização.',
    );
    expect(certificateStatusCopy({ status: 'AWAITING_RELEASE' }).description).not.toContain(
      'presenças estão confirmadas',
    );
  });

  it.each<CertificateParticipationStatus>([
    'PARTICIPATION_PENDING',
    'ATTENDANCE_UNCONFIRMED',
    'ATTENDANCE_UNDER_REVIEW',
    'GROUP_ATTENDANCE_INCOMPLETE',
    'REGISTRATION_PENDING',
    'RULES_UNDER_REVIEW',
    'NOT_OFFERED',
  ])('explains %s without promising an issued certificate', (status) => {
    const copy = certificateStatusCopy({ status });
    expect(copy.title).toBeTruthy();
    expect(copy.description).toBeTruthy();
    expect(copy.description).not.toContain('presenças estão confirmadas');
    expect(copy.action).toBeUndefined();
  });

  it.each(['PAYMENT_PENDING', 'PAYMENT_UNDER_REVIEW'] as const)('links %s to the correct major event', (status) => {
    expect(certificateStatusCopy({ status, actionTargetId: 'major' }).action?.route).toEqual([
      '/major-event',
      'major',
      'payment',
    ]);
    expect(certificateStatusCopy({ status }).action).toBeUndefined();
  });

  it('treats an unknown response as requiring review', () => {
    expect(certificateStatusCopy({ status: 'future-status' as CertificateParticipationStatus }).title).toBe(
      'Conferência necessária',
    );
  });
});
