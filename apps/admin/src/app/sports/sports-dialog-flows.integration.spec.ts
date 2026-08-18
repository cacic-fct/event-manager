import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { firstValueFrom } from 'rxjs';
import {
  SportsMatchCorrectionDialogComponent,
  type SportsMatchCorrectionDialogResult,
} from './sports-match-correction-dialog.component';

describe('sports correction dialog integration', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MatDialogModule],
      providers: [provideNoopAnimations()],
    });
  });

  afterEach(() => TestBed.inject(MatDialog).closeAll());

  it('opens through Material, renders match context, and returns the corrected cancellation contract', async () => {
    const dialogRef = TestBed.inject(MatDialog).open<
      SportsMatchCorrectionDialogComponent,
      unknown,
      SportsMatchCorrectionDialogResult
    >(SportsMatchCorrectionDialogComponent, {
      data: {
        mode: 'HISTORY',
        actionType: 'CANCEL',
        payloadJson: JSON.stringify({ actionId: 'action-1', reason: 'Chuva' }),
        homeRegistrationId: 'home-registration',
        awayRegistrationId: 'away-registration',
        homeTeamName: 'Equipe Azul',
        awayTeamName: 'Equipe Verde',
      },
    });
    const closed = firstValueFrom(dialogRef.afterClosed());
    dialogRef.componentInstance.form.patchValue({
      cancelReason: '  Quadra interditada  ',
      willReschedule: false,
    });

    dialogRef.componentInstance.save();

    const result = await closed;
    if (!result) throw new Error('The correction dialog must return a result when saved.');
    expect(document.body.textContent).not.toContain('Corrigir ocorrência registrada');
    expect(JSON.parse(result.payloadJson)).toEqual({
      actionId: 'action-1',
      reason: 'Quadra interditada',
      willReschedule: false,
    });
  });
});
