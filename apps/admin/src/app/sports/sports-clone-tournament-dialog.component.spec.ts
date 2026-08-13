import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  SportsCloneTournamentDialogComponent,
  type SportsCloneTournamentDialogData,
} from './sports-clone-tournament-dialog.component';

describe('SportsCloneTournamentDialogComponent', () => {
  const data: SportsCloneTournamentDialogData = {
    sourceMajorEventId: 'major-source',
    sourceName: 'Jogos atuais',
    destinations: [{ id: 'major-destination', name: 'Próximos jogos', emoji: '🏆' }],
  };
  const dialogRef = { close: vi.fn() };

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

  it('renders the shared source and destination fixture', () => {
    const fixture = TestBed.createComponent(SportsCloneTournamentDialogComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Jogos atuais');
    expect(fixture.componentInstance.form.controls.destinationMajorEventId.value).toBe('');
  });

  it('does not close while the destination is invalid', () => {
    const fixture = TestBed.createComponent(SportsCloneTournamentDialogComponent);

    invokeSubmit(fixture.componentInstance);

    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('normalizes registrations to include teams in the duplication request', () => {
    const fixture = TestBed.createComponent(SportsCloneTournamentDialogComponent);
    fixture.componentInstance.form.patchValue({
      destinationMajorEventId: 'major-destination',
      categories: false,
      teams: false,
      registrations: true,
      venues: false,
      officials: false,
      rules: true,
    });

    invokeSubmit(fixture.componentInstance);

    expect(fixture.componentInstance.form.controls.teams.value).toBe(true);
    expect(dialogRef.close).toHaveBeenCalledWith({
      destinationMajorEventId: 'major-destination',
      parts: {
        categories: false,
        teams: true,
        registrations: true,
        venues: false,
        officials: false,
        rules: true,
      },
    });
  });

  it('preserves an explicitly disabled team option when registrations are also disabled', () => {
    const fixture = TestBed.createComponent(SportsCloneTournamentDialogComponent);
    fixture.componentInstance.form.patchValue({
      destinationMajorEventId: 'major-destination',
      teams: false,
      registrations: false,
    });

    invokeSubmit(fixture.componentInstance);

    expect(dialogRef.close).toHaveBeenCalledWith(
      expect.objectContaining({ parts: expect.objectContaining({ teams: false, registrations: false }) }),
    );
  });
});

function invokeSubmit(component: SportsCloneTournamentDialogComponent): void {
  (component as unknown as { submit(): void }).submit();
}
