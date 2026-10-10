import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OralAttendanceComponent } from '@cacic-fct/shared-angular';
import { AttendanceDemoComponent } from './attendance-demo';

describe('AttendanceDemoComponent', () => {
  let fixture: ComponentFixture<AttendanceDemoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AttendanceDemoComponent] }).compileComponents();

    fixture = TestBed.createComponent(AttendanceDemoComponent);
    fixture.detectChanges();
  });

  it('keeps the oral attendance decision in local signal state and advances to the next person', () => {
    const component = fixture.componentInstance;
    const firstPerson = component.people()[0];
    expect(firstPerson).toBeDefined();
    if (!firstPerson) {
      throw new Error('Expected the attendance roster to include Marina Costa.');
    }

    const decisionsBefore = component.decisions();
    const presentButton = fixture.nativeElement.querySelector(
      'button[aria-label="Marcar como presente"]',
    ) as HTMLButtonElement | null;
    expect(presentButton).not.toBeNull();
    presentButton?.click();
    fixture.detectChanges();

    expect(component.decisions().get(firstPerson.personId)).toBe('PRESENT');
    expect(component.decisions()).not.toBe(decisionsBefore);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('1 de 3 pessoas classificadas');
    expect(fixture.nativeElement.querySelector('.person-card h2')?.textContent).toContain('Rafael Almeida');
  });

  it('restarts with the original roster and remounts the shared call component', () => {
    const component = fixture.componentInstance;
    for (const person of component.people()) {
      component.registerDecision({ person, decision: 'ABSENT' });
    }
    fixture.detectChanges();

    const originalChild = fixture.debugElement.query(By.directive(OralAttendanceComponent))?.componentInstance;
    expect(component.isComplete()).toBe(true);
    expect(originalChild).toBeDefined();
    const generationBeforeRestart = component.componentGeneration();

    component.restartCall();
    fixture.detectChanges();

    const restartedChild = fixture.debugElement.query(By.directive(OralAttendanceComponent))?.componentInstance;
    expect(component.decisions().size).toBe(0);
    expect(component.people().map((person) => person.fullName)).toEqual([
      'Marina Costa',
      'Rafael Almeida',
      'Beatriz Lima',
    ]);
    expect(component.componentGeneration()).toBe(generationBeforeRestart + 1);
    expect(restartedChild).not.toBe(originalChild);
    expect(component.isComplete()).toBe(false);
  });

  it('finishes manual entry in place without navigation or retaining the identifier', () => {
    const component = fixture.componentInstance;
    const exitHandler = vi.fn();
    component.exit.subscribe(exitHandler);
    component.registerManual('identifier-that-must-not-be-shown');
    fixture.detectChanges();

    expect(component.finished()).toBe(true);
    expect(component.people()).toHaveLength(3);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Chamada concluída.');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('identifier-that-must-not-be-shown');
    expect(fixture.nativeElement.querySelector('lib-oral-attendance')).toBeNull();
    expect(exitHandler).not.toHaveBeenCalled();

    component.restartCall();
    fixture.detectChanges();
    expect(component.finished()).toBe(false);
    expect(fixture.nativeElement.querySelector('lib-oral-attendance')).not.toBeNull();
  });

  it('prevents native form navigation and completes a submitted manual presence', () => {
    const component = fixture.componentInstance;
    for (const person of component.people()) component.registerDecision({ person, decision: 'PRESENT' });
    fixture.detectChanges();

    for (let step = 0; step < 2; step += 1) {
      const continueButton = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === 'Continuar');
      expect(continueButton).toBeDefined();
      continueButton?.click();
      fixture.detectChanges();
    }

    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector('input');
    const form = host.querySelector('form');
    if (!input || !form) throw new Error('Expected the manual attendance form.');
    input.value = 'visitante@exemplo.com.br';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const submission = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(submission);
    fixture.detectChanges();

    expect(submission.defaultPrevented).toBe(true);
    expect(component.finished()).toBe(true);
    expect(host.textContent).toContain('Chamada concluída.');
  });
});
