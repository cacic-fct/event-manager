import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EventAudience } from '@cacic-fct/shared-event-participation';
import { Permission } from '@cacic-fct/shared-permissions';
import { of } from 'rxjs';
import { AudienceEditorComponent } from './audience-editor.component';
import { PeopleApiService } from '../../graphql/people-api.service';
import { PermissionsService } from '../../permissions/permissions.service';

describe('AudienceEditorComponent', () => {
  let fixture: ComponentFixture<AudienceEditorComponent>;
  let peopleApi: {
    listPeopleSummaries: ReturnType<typeof vi.fn>;
    getPerson: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    peopleApi = {
      listPeopleSummaries: vi.fn(() => of([])),
      getPerson: vi.fn(() => of({ id: 'person-1', name: 'Ana Clara', email: 'ana@example.com' })),
    };
    await TestBed.configureTestingModule({
      imports: [AudienceEditorComponent, NoopAnimationsModule],
      providers: [
        { provide: PeopleApiService, useValue: peopleApi },
        {
          provide: PermissionsService,
          useValue: { has: (permission: Permission) => permission === Permission.Person.Read },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AudienceEditorComponent);
    fixture.detectChanges();
  });

  it('shows only the base audience controls for public access', () => {
    expect(fixture.nativeElement.textContent).toContain('Público');
    expect(fixture.nativeElement.querySelector('.audience-course-field')).toBeNull();
    expect(fixture.nativeElement.querySelector('.audience-invitations')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Este é o nível mais amplo');
  });

  it('reveals the course restriction only for course access', () => {
    fixture.componentRef.setInput('audience', EventAudience.COURSE_ONLY);
    fixture.componentRef.setInput('courseCodes', ['12']);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.audience-course-field')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Ciência da Computação');
    expect(fixture.nativeElement.textContent).toContain('matrícula confirmada no Account Manager');
    expect(fixture.nativeElement.querySelector('.audience-invitations')).toBeNull();
  });

  it('reveals selected invitees and keeps parent restrictions visible', () => {
    fixture.componentRef.setInput('audience', EventAudience.INVITATION_ONLY);
    fixture.componentRef.setInput('invitedPeople', [{ id: 'person-1', name: 'Ana', email: 'ana@example.com' }]);
    fixture.componentRef.setInput('parentRestrictions', [
      { label: 'Grande evento “Semana”', audience: EventAudience.UNESP_ONLY },
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.audience-invitations')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Ana');
    expect(fixture.nativeElement.textContent).toContain('As regras se acumulam');
    expect(fixture.nativeElement.textContent).toContain('somente pessoas da Unesp');
  });

  it('keeps invitees visible for attendance-only invitation rules', () => {
    fixture.componentRef.setInput('manageAttendanceInvitations', true);
    fixture.componentRef.setInput('invitedPeople', [{ id: 'person-1', name: 'Ana', email: 'ana@example.com' }]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.audience-invitations')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Pessoas convidadas para presença');
    expect(fixture.nativeElement.textContent).toContain('público de acesso acima é configurado separadamente');
  });

  it('preserves invitees when the access audience changes', () => {
    fixture.componentRef.setInput('audience', EventAudience.INVITATION_ONLY);
    fixture.componentRef.setInput('invitedPeople', [{ id: 'person-1', name: 'Ana', email: null }]);
    fixture.detectChanges();

    const audienceRadio = fixture.nativeElement.querySelectorAll('mat-radio-button')[0] as HTMLElement;
    audienceRadio.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.invitedPeople()).toEqual([{ id: 'person-1', name: 'Ana', email: null }]);
  });

  it('repairs a course-only audience with no selected course', () => {
    fixture.componentRef.setInput('audience', EventAudience.COURSE_ONLY);
    fixture.componentRef.setInput('courseCodes', []);
    fixture.detectChanges();

    expect(fixture.componentInstance.courseCodes()).toEqual(['12']);
  });

  it('keeps invitation controls read-only while showing the selected people', () => {
    fixture.componentRef.setInput('audience', EventAudience.INVITATION_ONLY);
    fixture.componentRef.setInput('invitedPeople', [{ id: 'person-1', name: 'Ana', email: null }]);
    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.invited-person button')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-person-search input').disabled).toBe(true);
  });

  it('shows the publication error without disabling private draft editing', () => {
    fixture.componentRef.setInput('audience', EventAudience.INVITATION_ONLY);
    fixture.componentRef.setInput('publicationError', 'Para publicar, adicione uma pessoa convidada.');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Para publicar');
  });

  it('keeps unresolved invitation IDs and offers a metadata retry', async () => {
    peopleApi.getPerson.mockReturnValue(of({ id: 'person-unknown', name: 'Ana Clara', email: 'ana@example.com' }));
    fixture.componentRef.setInput('audience', EventAudience.INVITATION_ONLY);
    fixture.componentRef.setInput('invitedPeople', [
      { id: 'person-unknown', name: 'Pessoa convidada (dados indisponíveis)', email: null, unresolved: true },
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('sem dados carregados');
    const retryButton = [...fixture.nativeElement.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Tentar carregar novamente'),
    );
    expect(retryButton).toBeTruthy();
    retryButton?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(peopleApi.getPerson).toHaveBeenCalledWith('person-unknown');
    expect(fixture.nativeElement.textContent).toContain('Ana Clara');
  });
});
