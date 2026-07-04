import { AttendancePersonResolutionDialogComponent } from './attendance-person-resolution-dialog.component';

describe('AttendancePersonResolutionDialogComponent', () => {
  it('formats candidate details with available identifiers', () => {
    const component = Object.create(AttendancePersonResolutionDialogComponent.prototype) as {
      candidateDetails: AttendancePersonResolutionDialogComponent['candidateDetails'];
    };

    expect(
      component.candidateDetails({
        id: 'person-1',
        name: 'Ana',
        email: 'ana@example.com',
        phone: '+5511999999975',
        identityDocument: '11999999975',
        academicId: '123456',
        createdAt: '2026-06-01T12:00:00.000Z',
        updatedAt: '2026-06-01T12:00:00.000Z',
      }),
    ).toBe('E-mail: ana@example.com · Telefone: +5511999999975 · Documento: 11999999975 · Matrícula: 123456');
  });

  it('shows a fallback when no candidate details are available', () => {
    const component = Object.create(AttendancePersonResolutionDialogComponent.prototype) as {
      candidateDetails: AttendancePersonResolutionDialogComponent['candidateDetails'];
    };

    expect(
      component.candidateDetails({
        id: 'person-1',
        name: 'Ana',
        createdAt: '2026-06-01T12:00:00.000Z',
        updatedAt: '2026-06-01T12:00:00.000Z',
      }),
    ).toBe('Sem dados complementares');
  });
});
