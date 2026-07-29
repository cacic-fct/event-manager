import { CertificateIssuedTo } from '@cacic-fct/shared-data-types';
import { SportsOfficialRole, SportsRosterRole } from '@prisma/client';

export type AutomaticSportsCertificateIssuedTo =
  | typeof CertificateIssuedTo.SPORTS_PLAYER
  | typeof CertificateIssuedTo.SPORTS_CAPTAIN
  | typeof CertificateIssuedTo.SPORTS_COACH
  | typeof CertificateIssuedTo.SPORTS_REFEREE
  | typeof CertificateIssuedTo.SPORTS_INTERMEDIATOR
  | typeof CertificateIssuedTo.SPORTS_SCOREKEEPER;

const SPORTS_ROSTER_ROLE_BY_ISSUED_TO: Partial<Record<CertificateIssuedTo, SportsRosterRole>> = {
  [CertificateIssuedTo.SPORTS_PLAYER]: SportsRosterRole.PLAYER,
  [CertificateIssuedTo.SPORTS_CAPTAIN]: SportsRosterRole.CAPTAIN,
  [CertificateIssuedTo.SPORTS_COACH]: SportsRosterRole.COACH,
};

const SPORTS_OFFICIAL_ROLE_BY_ISSUED_TO: Partial<Record<CertificateIssuedTo, SportsOfficialRole>> = {
  [CertificateIssuedTo.SPORTS_REFEREE]: SportsOfficialRole.REFEREE,
  [CertificateIssuedTo.SPORTS_INTERMEDIATOR]: SportsOfficialRole.INTERMEDIATOR,
  [CertificateIssuedTo.SPORTS_SCOREKEEPER]: SportsOfficialRole.SCOREKEEPER,
};

const SPORTS_CERTIFICATE_TYPE_LABEL: Partial<Record<CertificateIssuedTo, string>> = {
  [CertificateIssuedTo.SPORTS_PLAYER]: 'Atleta',
  [CertificateIssuedTo.SPORTS_CAPTAIN]: 'Capitão/Capitã',
  [CertificateIssuedTo.SPORTS_COACH]: 'Técnico/Técnica',
  [CertificateIssuedTo.SPORTS_REFEREE]: 'Árbitro/Árbitra',
  [CertificateIssuedTo.SPORTS_INTERMEDIATOR]: 'Intermediador/Intermediadora',
  [CertificateIssuedTo.SPORTS_SCOREKEEPER]: 'Responsável pela pontuação',
  [CertificateIssuedTo.SPORTS_ORGANIZER]: 'Organização',
};

const SPORTS_PARTICIPATION_TEXT: Partial<Record<CertificateIssuedTo, string>> = {
  [CertificateIssuedTo.SPORTS_PLAYER]: 'Certificamos a participação como atleta de:',
  [CertificateIssuedTo.SPORTS_CAPTAIN]: 'Certificamos a participação como capitão/capitã de:',
  [CertificateIssuedTo.SPORTS_COACH]: 'Certificamos a participação como técnico/técnica de:',
  [CertificateIssuedTo.SPORTS_REFEREE]: 'Certificamos a participação como árbitro/árbitra de:',
  [CertificateIssuedTo.SPORTS_INTERMEDIATOR]: 'Certificamos a participação como intermediador/intermediadora de:',
  [CertificateIssuedTo.SPORTS_SCOREKEEPER]: 'Certificamos a participação como responsável pela pontuação de:',
  [CertificateIssuedTo.SPORTS_ORGANIZER]: 'Certificamos a participação na organização de:',
};

export function sportsRosterRoleForCertificate(issuedTo: CertificateIssuedTo): SportsRosterRole | null {
  return SPORTS_ROSTER_ROLE_BY_ISSUED_TO[issuedTo] ?? null;
}

export function sportsOfficialRoleForCertificate(issuedTo: CertificateIssuedTo): SportsOfficialRole | null {
  return SPORTS_OFFICIAL_ROLE_BY_ISSUED_TO[issuedTo] ?? null;
}

export function isAutomaticSportsCertificateIssuedTo(
  issuedTo: CertificateIssuedTo,
): issuedTo is AutomaticSportsCertificateIssuedTo {
  return sportsRosterRoleForCertificate(issuedTo) !== null || sportsOfficialRoleForCertificate(issuedTo) !== null;
}

export function isManualCertificateIssuedTo(issuedTo: CertificateIssuedTo): boolean {
  return issuedTo === CertificateIssuedTo.OTHER || issuedTo === CertificateIssuedTo.SPORTS_ORGANIZER;
}

export function sportsCertificateTypeLabel(issuedTo: CertificateIssuedTo): string | null {
  return SPORTS_CERTIFICATE_TYPE_LABEL[issuedTo] ?? null;
}

export function sportsParticipationText(issuedTo: CertificateIssuedTo): string | null {
  return SPORTS_PARTICIPATION_TEXT[issuedTo] ?? null;
}
