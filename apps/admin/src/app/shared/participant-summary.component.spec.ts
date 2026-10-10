import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ParticipantSummaryComponent } from './participant-summary.component';

describe('ParticipantSummaryComponent', () => {
  let fixture: ComponentFixture<ParticipantSummaryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ParticipantSummaryComponent] }).compileComponents();
    fixture = TestBed.createComponent(ParticipantSummaryComponent);
    fixture.componentRef.setInput('person', {
      id: 'person-1',
      name: 'Ana Silva',
      email: 'ana@example.com',
      phone: '18999999999',
      identityDocument: '12345678901',
      academicId: '20261234',
      user: {
        id: 'user-1',
        name: 'Ana Silva',
        email: 'ana@example.com',
        role: 'USER',
        unespRole: ['aluno-graduacao', 'UNKNOWN'],
      },
      createdAt: '2026-09-13T10:00:00.000Z',
      updatedAt: '2026-09-13T10:00:00.000Z',
    });
    fixture.detectChanges();
  });

  it('renders searchable participant metadata and masks the document by default', () => {
    expect(fixture.nativeElement.textContent).toContain('Ana Silva');
    expect(fixture.nativeElement.textContent).toContain('ana@example.com');
    expect(fixture.nativeElement.textContent).toContain('RA 20261234');
    expect(fixture.nativeElement.textContent).toContain('•••8901');
    expect(fixture.nativeElement.textContent).toContain('Aluno da Graduação');
    expect(fixture.nativeElement.textContent).toContain('Vínculo com a Unesp não informado');
    expect(fixture.nativeElement.textContent).not.toContain('aluno-graduacao');
    expect(fixture.nativeElement.textContent).not.toContain('UNKNOWN');
  });
});
