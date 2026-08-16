import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { PublicMapFilterDialog, PublicMapFilterDialogData } from './public-map-filter-dialog';

describe('PublicMapFilterDialog', () => {
  let fixture: ComponentFixture<PublicMapFilterDialog>;
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  afterEach(() => TestBed.resetTestingModule());

  it('shows both dimensions, preserves initial values, and applies the selection', async () => {
    const component = await createDialog({
      filters: { audience: 'MINE', date: 'TODAY' },
      isAuthenticated: true,
    });

    expect(component.audience()).toBe('MINE');
    expect(component.date()).toBe('TODAY');
    expect(fixture.nativeElement.textContent).toContain('Participação');
    expect(fixture.nativeElement.textContent).toContain('Período');

    component.apply();

    expect(dialogRef.close).toHaveBeenCalledWith({ audience: 'MINE', date: 'TODAY' });
  });

  it('clears both dimensions before applying', async () => {
    const component = await createDialog({
      filters: { audience: 'MINE', date: 'TODAY' },
      isAuthenticated: true,
    });

    component.clear();
    component.apply();

    expect(dialogRef.close).toHaveBeenCalledWith({ audience: 'ALL', date: 'ALL' });
  });

  it('disables my events and explains authentication to signed-out visitors', async () => {
    await createDialog({ filters: { audience: 'ALL', date: 'ALL' }, isAuthenticated: false });

    const mineToggle = [...fixture.nativeElement.querySelectorAll('mat-radio-button')].find((element: Element) =>
      element.textContent?.includes('Meus eventos'),
    );

    expect(mineToggle?.classList.contains('mat-mdc-radio-disabled')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Entre para ver seus eventos.');
  });

  async function createDialog(data: PublicMapFilterDialogData): Promise<PublicMapFilterDialog> {
    dialogRef = { close: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [PublicMapFilterDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PublicMapFilterDialog);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.componentInstance;
  }
});
