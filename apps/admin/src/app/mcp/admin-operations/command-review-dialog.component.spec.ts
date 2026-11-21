import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AdminOperationsApi } from './admin-operations-api.service';
import { CommandReviewDialogComponent } from './command-review-dialog.component';
import { sportsCommand } from './admin-operations.fixtures';

describe('CommandReviewDialogComponent', () => {
  function setup() {
    const command = sportsCommand();
    const review = vi
      .fn()
      .mockImplementation(async (_id, input) => ({
        ...input,
        arguments: { matchId: 'partida-demo', score: 3 },
        proposalId: command.id,
        operation: command.operation,
        effects: 'Efeito validado',
        token: 'server-token',
      }));
    const decide = vi.fn().mockResolvedValue({ success: true, state: 'APPLIED' });
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: command },
        { provide: MatDialogRef, useValue: { close } },
        { provide: AdminOperationsApi, useValue: { review, decide } },
      ],
    });
    const fixture = TestBed.createComponent(CommandReviewDialogComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, fixture, review, decide, close };
  }
  it('shows server-owned target names and identifiers before the editable arguments', () => {
    const { fixture } = setup();
    const targets = fixture.nativeElement.querySelector('[aria-label="Destinos da operação"]') as HTMLElement;
    expect(targets.textContent).toContain('Equipe Azul (demonstração)');
    expect(targets.textContent).toContain('Equipe esportiva: equipe-demo');
    expect(fixture.nativeElement.querySelector('mat-dialog-content').textContent.indexOf('Equipe Azul')).toBeLessThan(
      fixture.nativeElement.querySelector('mat-dialog-content').textContent.indexOf('Enviado pelo aplicativo'),
    );
  });

  it('omits discarded optional fields and sends the authoritative normalized preview', async () => {
    const { component, review, decide } = setup();
    const notes = component.fields.find((field) => field.key === 'notes');
    expect(notes).toBeDefined();
    if (!notes) throw new Error('Missing notes fixture');
    component.include(notes, false);
    await component.prepare();
    expect(review.mock.calls[0][1].arguments).not.toHaveProperty('notes');
    const preview = component.preview();
    expect(preview?.arguments['score']).toBe(3);
    await component.approve();
    expect(decide).toHaveBeenCalledWith('demo-command', {
      decision: 'APPROVE',
      expectedFingerprint: 'demo-fingerprint',
      review: preview,
    });
  });
  it('closes with success only after an applied execution', async () => {
    const { component, close } = setup();
    await component.prepare();
    await component.approve();
    expect(close).toHaveBeenCalledWith(true);
  });

  it.each(['UNCERTAIN', 'APPLYING'])('keeps HTTP-successful %s execution open and never retries', async (state) => {
    const { component, fixture, decide, review, close } = setup();
    decide.mockResolvedValueOnce({ success: true, state });
    await component.prepare();
    await component.approve();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(close).not.toHaveBeenCalled();
    expect(component.executionAttempted()).toBe(true);
    expect(component.preview()).toBeNull();
    expect(component.error()).toContain('Não repita');
    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((element) =>
      (element as HTMLButtonElement).textContent?.includes('Conferir argumentos finais'),
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await component.prepare();
    await component.approve();
    expect(decide).toHaveBeenCalledTimes(1);
    expect(review).toHaveBeenCalledTimes(1);
  });

  it('invalidates a signed preview whenever a value or selection changes', async () => {
    const { component, decide } = setup();
    await component.prepare();
    const score = component.fields.find((field) => field.key === 'score');
    if (!score) throw new Error('Missing score fixture');
    score.control.setValue('4');
    expect(component.preview()).toBeNull();
    await component.approve();
    expect(decide).not.toHaveBeenCalled();
    await component.prepare();
    const notes = component.fields.find((field) => field.key === 'notes');
    if (!notes) throw new Error('Missing notes fixture');
    component.include(notes, false);
    expect(component.preview()).toBeNull();
  });
  it('does not accept a preview returned after an intervening edit', async () => {
    const { component, review } = setup();
    let resolve!: (value: unknown) => void;
    review.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = component.prepare();
    component.fields[1].control.setValue('9');
    resolve({ token: 'stale' });
    await pending;
    expect(component.preview()).toBeNull();
  });
  it('prevents a second execution after a lost response and focuses the error', async () => {
    const { component, fixture, decide } = setup();
    decide.mockRejectedValueOnce(new Error('Confira o histórico.'));
    await component.prepare();
    await component.approve();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.executionAttempted()).toBe(true);
    expect(component.preview()).toBeNull();
    await component.prepare();
    await component.approve();
    expect(decide).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('Confira o histórico');
  });
});
