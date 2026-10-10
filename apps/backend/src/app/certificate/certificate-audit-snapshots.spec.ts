import { toCertificateAuditSnapshot, toCertificateConfigAuditSnapshot } from './certificate-audit-snapshots';

describe('certificate audit snapshots', () => {
  it('keeps config state and references without nested event or template source content', () => {
    const snapshot = toCertificateConfigAuditSnapshot({
      id: 'config-1',
      name: 'Participação',
      scope: 'EVENT',
      eventId: 'event-1',
      event: { id: 'event-1', name: 'Evento', description: 'Long description' },
      certificateTemplateId: 'template-1',
      certificateTemplate: { id: 'template-1', htmlTemplate: '<html>large</html>', cssTemplate: '.large{}' },
      certificateFields: { campus: 'Campus Central' },
    } as never);

    expect(snapshot).toMatchObject({
      id: 'config-1',
      name: 'Participação',
      scope: 'EVENT',
      eventId: 'event-1',
      certificateTemplateId: 'template-1',
      certificateFields: { campus: 'Campus Central' },
    });
    expect(snapshot).not.toHaveProperty('event');
    expect(snapshot).not.toHaveProperty('certificateTemplate');
  });

  it('keeps issuance state without rendered data or linked profile and config snapshots', () => {
    const issuedAt = new Date();
    const snapshot = toCertificateAuditSnapshot({
      id: 'certificate-1',
      personId: 'person-1',
      person: { id: 'person-1', name: 'Ana Silva', identityDocument: '123' },
      configId: 'config-1',
      config: { id: 'config-1', name: 'Participação' },
      certificateTemplateId: 'template-1',
      issuedAt,
      issuedById: 'admin-1',
      deletedAt: null,
      renderedData: { fullName: 'Ana Silva', customField: 'large rendered value' },
    } as never);

    expect(snapshot).toEqual({
      id: 'certificate-1',
      personId: 'person-1',
      configId: 'config-1',
      certificateTemplateId: 'template-1',
      issuedAt,
      issuedById: 'admin-1',
      deletedAt: null,
    });
    expect(snapshot).not.toHaveProperty('renderedData');
    expect(snapshot).not.toHaveProperty('person');
    expect(snapshot).not.toHaveProperty('config');
  });
});
