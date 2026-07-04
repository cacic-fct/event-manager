import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import {
  PersonLinkedDataSummary,
  PersonLinkedResourceGroup,
  PersonLinkedResourcePage,
} from '@cacic-fct/event-manager-admin-contracts';
import { PeopleApiService } from '../../graphql/people-api.service';
import { PersonLinkedDataDialogComponent, PersonLinkedDataDialogData } from './person-linked-data-dialog.component';

describe('PersonLinkedDataDialogComponent', () => {
  it('loads a resource page when a group is expanded', async () => {
    const { api, component } = await createFixture();

    await component.onGroupExpanded(summaryGroup, true);

    expect(api.getPersonLinkedResources).toHaveBeenCalledWith('person-1', 'CERTIFICATE', 0, 10);
    expect(component.groupPage('CERTIFICATE').page?.items).toEqual([resourcePage.items[0]]);
  });

  it('renders summary items immediately when they are available', async () => {
    const groupWithItems = {
      ...summaryGroup,
      items: [resourcePage.items[0]],
    };
    const { api, component, fixture } = await createFixture({
      summary: {
        ...linkedSummary,
        groups: [groupWithItems],
      },
    });

    await component.onGroupExpanded(groupWithItems, true);
    fixture.detectChanges();

    expect(api.getPersonLinkedResources).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Certificado de participação');
  });
});

async function createFixture({
  summary = linkedSummary,
}: {
  summary?: PersonLinkedDataSummary;
} = {}): Promise<{
  api: {
    getPersonLinkedDataSummary: ReturnType<typeof vi.fn>;
    getPersonLinkedResources: ReturnType<typeof vi.fn>;
    deletePerson: ReturnType<typeof vi.fn>;
  };
  component: PersonLinkedDataDialogComponent;
  fixture: ComponentFixture<PersonLinkedDataDialogComponent>;
}> {
  const api = {
    getPersonLinkedDataSummary: vi.fn(() => of(summary)),
    getPersonLinkedResources: vi.fn(() => of(resourcePage)),
    deletePerson: vi.fn(),
  };

  await TestBed.configureTestingModule({
    imports: [PersonLinkedDataDialogComponent],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      {
        provide: MAT_DIALOG_DATA,
        useValue: dialogData,
      },
      {
        provide: MatDialogRef,
        useValue: { close: vi.fn() },
      },
      {
        provide: MatDialog,
        useValue: { open: vi.fn() },
      },
      {
        provide: MatSnackBar,
        useValue: { open: vi.fn() },
      },
      {
        provide: PeopleApiService,
        useValue: api,
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(PersonLinkedDataDialogComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return {
    api,
    component: fixture.componentInstance,
    fixture,
  };
}

const dialogData = {
  personId: 'person-1',
  personName: 'Ada Lovelace',
} satisfies PersonLinkedDataDialogData;

const summaryGroup = {
  type: 'CERTIFICATE',
  label: 'Certificados',
  icon: 'workspace_premium',
  totalCount: 1,
} satisfies PersonLinkedResourceGroup;

const linkedSummary = {
  personId: 'person-1',
  groups: [summaryGroup],
  totalCount: 1,
  hasLinkedData: true,
  canDelete: false,
} satisfies PersonLinkedDataSummary;

const resourcePage = {
  personId: 'person-1',
  type: 'CERTIFICATE',
  label: 'Certificados',
  icon: 'workspace_premium',
  items: [
    {
      id: 'certificate-1',
      label: 'Certificado de participação',
      description: 'Grande evento: CACiC Tech Week',
      route: '/certificates/major-event/major-1/config-1',
      status: null,
      occurredAt: '2026-06-21T12:00:00.000Z',
    },
  ],
  total: 1,
  skip: 0,
  take: 10,
} satisfies PersonLinkedResourcePage;
