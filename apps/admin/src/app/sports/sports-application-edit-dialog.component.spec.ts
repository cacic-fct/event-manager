import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import {
  SportsApplicationEditDialogComponent,
  type SportsApplicationEditDialogData,
} from './sports-application-edit-dialog.component';

describe('SportsApplicationEditDialogComponent', () => {
  const dialogRef = { close: vi.fn() };
  const data = {
    application: {
      requestedTeam: { id: 'team-1' },
      categories: [{ id: 'category-open' }, { id: 'category-closed' }],
      paymentTier: 'Lote legado',
    },
    teams: [
      { id: 'team-1', name: 'Equipe Azul' },
      { id: 'team-2', name: 'Equipe Verde' },
    ],
    categories: [
      { id: 'category-open', name: 'Futsal', status: 'REGISTRATION_OPEN' },
      { id: 'category-active', name: 'Vôlei', status: 'ACTIVE' },
      { id: 'category-closed', name: 'Xadrez', status: 'FINISHED' },
    ],
    teamSummaries: [
      {
        team: { id: 'team-1' },
        registrations: [
          { categoryId: 'category-open', status: 'APPROVED' },
          { categoryId: 'category-active', status: 'REJECTED' },
        ],
      },
      {
        team: { id: 'team-2' },
        registrations: [{ categoryId: 'category-active', status: 'ACTIVE' }],
      },
    ],
    paymentTiers: [{ name: 'Primeiro lote', value: 5000 }],
    allowNoTeam: false,
    allowNoCategory: false,
    paymentRequired: true,
  } as unknown as SportsApplicationEditDialogData;

  beforeEach(() => {
    dialogRef.close.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    });
  });

  it('only offers active categories backed by an eligible team registration', () => {
    const component = TestBed.createComponent(SportsApplicationEditDialogComponent).componentInstance;

    expect(component.availableCategories().map((category) => category.id)).toEqual(['category-open']);
    expect(component.paymentTiers()).toContainEqual({ name: 'Lote legado', value: -1 });
  });

  it('removes stale categories when the assigned team changes', () => {
    const component = TestBed.createComponent(SportsApplicationEditDialogComponent).componentInstance;

    component.teamChanged('team-2');

    expect(component.availableCategories().map((category) => category.id)).toEqual(['category-active']);
    expect(component.form.controls.categoryIds.value).toEqual([]);
    expect(component.form.invalid).toBe(true);
  });

  it('normalizes optional selections in the saved correction', () => {
    const optionalData = { ...data, allowNoTeam: true, allowNoCategory: true, paymentRequired: false };
    TestBed.overrideProvider(MAT_DIALOG_DATA, { useValue: optionalData });
    const component = TestBed.createComponent(SportsApplicationEditDialogComponent).componentInstance;
    component.form.setValue({ requestedTeamId: '', categoryIds: [], paymentTier: '' });

    component.save();

    expect(dialogRef.close).toHaveBeenCalledWith({
      requestedTeamId: null,
      categoryIds: [],
      paymentTier: null,
    });
  });
});
