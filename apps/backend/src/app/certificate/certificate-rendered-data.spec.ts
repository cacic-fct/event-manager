import { CertificateIssuedTo, CertificateScope } from '@cacic-fct/shared-data-types';
import { buildCertificateRenderedData } from './certificate-rendered-data';

describe('certificate rendered data', () => {
  it('uses the São Paulo calendar date for the PDF issue date', () => {
    const rendered = buildCertificateRenderedData(
      {
        id: 'config-1',
        name: 'Certificado',
        scope: CertificateScope.MAJOR_EVENT,
        majorEventId: 'major-event-1',
        majorEvent: { id: 'major-event-1', name: 'Evento' },
        issuedTo: CertificateIssuedTo.ATTENDEE,
        certificateText: null,
        certificateTypeLabel: null,
        shouldAutofillSecondPage: true,
        secondPageText: null,
        certificateFields: null,
        certificateTemplate: { certificateFields: null },
      } as never,
      {
        person: {
          id: 'person-1',
          name: 'Ada Lovelace',
          email: null,
          identityDocument: null,
          academicId: null,
        },
        events: [],
      } as never,
      new Date('2026-08-20T02:15:00.000Z'),
    );

    expect(rendered.templateData).toMatchObject({
      issue_day: '19',
      issue_month: 'agosto',
      issue_year: '2026',
      date: '19 de agosto de 2026',
    });
  });
});
