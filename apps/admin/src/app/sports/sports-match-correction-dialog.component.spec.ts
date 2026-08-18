import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import {
  SportsMatchCorrectionDialogComponent,
  type SportsMatchCorrectionDialogData,
  supportsEventualActionCorrection,
} from './sports-match-correction-dialog.component';

describe('SportsMatchCorrectionDialogComponent', () => {
  const dialogRef = { close: vi.fn() };

  beforeEach(() => dialogRef.close.mockReset());

  it.each(['SCORE_DELTA', 'SCORE_CORRECTION', 'FINALIZE', 'FORFEIT', 'OCCURRENCE', 'CANCEL'] as const)(
    'supports correction of %s actions',
    (actionType) => expect(supportsEventualActionCorrection(actionType)).toBe(true),
  );

  it('rejects a zero score delta and preserves unrelated payload metadata', () => {
    const component = createComponent({
      actionType: 'SCORE_DELTA',
      payloadJson: JSON.stringify({ side: 'AWAY', amount: 2, source: 'official-table' }),
    });
    component.form.controls.amount.setValue(0);

    component.save();

    expect(component.form.controls.amount.hasError('nonZero')).toBe(true);
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('corrects a finalized match winner and scoreboard as one audited payload', () => {
    const component = createComponent({
      actionType: 'FINALIZE',
      mode: 'RESULT',
      payloadJson: JSON.stringify({ scoreboard: { home: 1, away: 0 }, auditKey: 'action-1' }),
    });
    component.form.patchValue({
      homeScore: 1,
      awayScore: 2,
      draw: false,
      loserRegistrationId: 'home-registration',
      lossReason: 'SCORE',
      lossReasonDetail: 'Placar conferido pela mesa',
    });

    component.save();

    const result = dialogRef.close.mock.calls[0]?.[0] as { payloadJson: string };
    expect(JSON.parse(result.payloadJson)).toEqual({
      auditKey: 'action-1',
      draw: false,
      winnerRegistrationId: 'away-registration',
      loserRegistrationId: 'home-registration',
      lossReason: 'SCORE',
      lossReasonDetail: 'Placar conferido pela mesa',
      scoreboard: { home: 1, away: 2 },
    });
  });

  it('clears winner and loss metadata when a result is corrected to a rescheduled draw', () => {
    const component = createComponent({
      actionType: 'FORFEIT',
      mode: 'RESULT',
      payloadJson: '{ invalid json',
    });
    component.form.patchValue({ homeScore: 0, awayScore: 0, draw: true, drawWillReschedule: true });

    component.save();

    const result = dialogRef.close.mock.calls[0]?.[0] as { payloadJson: string };
    expect(JSON.parse(result.payloadJson)).toEqual({
      draw: true,
      drawWillReschedule: true,
      scoreboard: { home: 0, away: 0 },
    });
  });

  it('trims occurrence notes before saving', () => {
    const component = createComponent({ actionType: 'OCCURRENCE' });
    component.form.patchValue({ occurrenceKind: 'INJURY', occurrenceNote: '  Atendimento em quadra  ' });

    component.save();

    const result = dialogRef.close.mock.calls[0]?.[0] as { payloadJson: string };
    expect(JSON.parse(result.payloadJson)).toEqual({ kind: 'INJURY', note: 'Atendimento em quadra' });
  });

  function createComponent(overrides: Partial<SportsMatchCorrectionDialogData>) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideNoopAnimations(),
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            mode: 'ACTION',
            actionType: 'CANCEL',
            payloadJson: '{}',
            homeRegistrationId: 'home-registration',
            awayRegistrationId: 'away-registration',
            homeTeamName: 'Azul',
            awayTeamName: 'Verde',
            ...overrides,
          } satisfies SportsMatchCorrectionDialogData,
        },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    });
    return TestBed.createComponent(SportsMatchCorrectionDialogComponent).componentInstance;
  }
});
