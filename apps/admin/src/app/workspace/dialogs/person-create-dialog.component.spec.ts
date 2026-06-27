import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { PeopleApiService } from '../../graphql/people-api.service';
import { Person } from '@cacic-fct/event-manager-admin-contracts';
import { PersonCreateDialogComponent } from './person-create-dialog.component';

describe('PersonCreateDialogComponent', () => {
  it('does not call the API when the signal form is invalid', async () => {
    const { api, component } = await createFixture();

    component.form.name().value.set('A');
    await component.onSaveClick();

    expect(api.listPeopleSummaries).not.toHaveBeenCalled();
    expect(api.createPerson).not.toHaveBeenCalled();
  });

  it('creates a person with trimmed optional fields', async () => {
    const { api, component, dialogRef } = await createFixture();
    component.form.name().value.set(' Ada Lovelace ');
    component.form.email().value.set(' ada@example.com ');
    component.form.identityDocument().value.set(' 123456 ');

    await component.onSaveClick();

    expect(api.createPerson).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      identityDocument: '123456',
      academicId: null,
    });
    expect(dialogRef.close).toHaveBeenCalledWith(personFixture);
  });

  it('shows duplicate feedback and keeps the dialog open when a matching person exists', async () => {
    const { api, component, dialogRef } = await createFixture({
      duplicateCandidates: [{ id: 'person-2', name: 'Ada Lovelace', email: 'ada@example.com' }],
    });
    component.form.name().value.set('Ada Lovelace');
    component.form.email().value.set('ada@example.com');

    await component.onSaveClick();

    expect(component.errorMessage()).toContain('Já existe uma pessoa');
    expect(api.createPerson).not.toHaveBeenCalled();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });
});

async function createFixture({
  duplicateCandidates = [],
}: {
  duplicateCandidates?: Array<{ id: string; name: string; email?: string | null; identityDocument?: string | null }>;
} = {}): Promise<{
  api: {
    createPerson: ReturnType<typeof vi.fn>;
    listPeopleSummaries: ReturnType<typeof vi.fn>;
  };
  component: PersonCreateDialogComponent;
  dialogRef: { close: ReturnType<typeof vi.fn> };
  fixture: ComponentFixture<PersonCreateDialogComponent>;
}> {
  const api = {
    createPerson: vi.fn(() => of(personFixture)),
    listPeopleSummaries: vi.fn(() => of(duplicateCandidates)),
  };
  const dialogRef = {
    close: vi.fn(),
  };

  await TestBed.configureTestingModule({
    imports: [PersonCreateDialogComponent],
    providers: [
      provideNoopAnimations(),
      {
        provide: MatDialogRef,
        useValue: dialogRef,
      },
      {
        provide: PeopleApiService,
        useValue: api,
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(PersonCreateDialogComponent);

  return {
    api,
    component: fixture.componentInstance,
    dialogRef,
    fixture,
  };
}

const personFixture = {
  id: 'person-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  identityDocument: '123456',
  academicId: null,
} as Person;
