import { CertificateIssuedTo, CertificateScope } from '@cacic-fct/shared-data-types';
import { buildCertificateRenderedData } from './certificate-rendered-data';

describe('sports certificate rendered data', () => {
  const person = {
    id: 'person-1',
    name: 'Ada Lovelace',
    email: null,
    identityDocument: null,
    academicId: null,
  };

  it.each([
    [CertificateIssuedTo.SPORTS_PLAYER, 'Atleta', 'como atleta'],
    [CertificateIssuedTo.SPORTS_CAPTAIN, 'Capitão/Capitã', 'como capitão/capitã'],
    [CertificateIssuedTo.SPORTS_COACH, 'Técnico/Técnica', 'como técnico/técnica'],
    [CertificateIssuedTo.SPORTS_REFEREE, 'Árbitro/Árbitra', 'como árbitro/árbitra'],
    [
      CertificateIssuedTo.SPORTS_INTERMEDIATOR,
      'Intermediador/Intermediadora',
      'como intermediador/intermediadora',
    ],
    [CertificateIssuedTo.SPORTS_SCOREKEEPER, 'Responsável pela pontuação', 'como responsável pela pontuação'],
    [CertificateIssuedTo.SPORTS_ORGANIZER, 'Organização', 'na organização'],
  ])('renders distinct template naming for %s', (issuedTo, expectedLabel, expectedParticipationText) => {
    const rendered = buildCertificateRenderedData(
      {
        id: 'config-1',
        name: 'Certificado esportivo',
        scope: CertificateScope.MAJOR_EVENT,
        majorEventId: 'major-event-1',
        majorEvent: {
          id: 'major-event-1',
          name: 'Jogos Universitários',
        },
        issuedTo,
        certificateText: null,
        certificateTypeLabel: null,
        shouldAutofillSecondPage: true,
        secondPageText: null,
        certificateFields: null,
        certificateTemplate: {
          certificateFields: null,
        },
      } as never,
      {
        person,
        events: [],
      } as never,
      new Date('2026-07-29T12:00:00.000Z'),
    );

    expect(rendered.certificateTypeLabel).toBe(expectedLabel);
    expect((rendered.templateData as Record<string, unknown>).certificate_type).toBe(expectedLabel);
    expect((rendered.templateData as Record<string, unknown>).participation_type).toContain(
      expectedParticipationText,
    );
  });
});
