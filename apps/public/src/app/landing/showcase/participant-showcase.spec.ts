import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ParticipantShowcaseComponent } from './participant-showcase';

describe('ParticipantShowcaseComponent', () => {
  let fixture: ComponentFixture<ParticipantShowcaseComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParticipantShowcaseComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(ParticipantShowcaseComponent);
    fixture.componentRef.setInput('feature', 'attendance');
    fixture.detectChanges();
  });

  function enterCode(value: string): void {
    const input = (fixture.nativeElement as HTMLElement).querySelector('input');
    if (!input) throw new Error('Attendance code input was not rendered');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('rejects a plausible but incorrect code and explains the demo code', () => {
    enterCode('AB12');
    fixture.componentInstance.confirmAttendance();
    fixture.detectChanges();

    expect(fixture.componentInstance.attendanceConfirmed()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('KC1C');
  });

  it('accepts the demo code without regard to case and can reset the demo', () => {
    enterCode('kc1c');
    fixture.componentInstance.confirmAttendance();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Presença confirmada para Interfaces que incluem.');
    expect(fixture.componentInstance.attendanceConfirmed()).toBe(true);

    fixture.componentInstance.resetAttendance();
    fixture.detectChanges();

    expect(fixture.componentInstance.attendanceConfirmed()).toBe(false);
    expect(fixture.componentInstance.attendanceForm().invalid()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('input')?.value).toBe('');
  });

  it('keeps confirmation disabled until all four code characters are entered', () => {
    enterCode('C4C');
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[type="submit"]');

    expect(button?.disabled).toBe(true);
    fixture.componentInstance.confirmAttendance();
    expect(fixture.componentInstance.attendanceConfirmed()).toBe(false);
  });

  it('connects the next activity to the attendance demo', () => {
    fixture.componentRef.setInput('feature', 'day');
    fixture.detectChanges();
    const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')]
      .find((item) => item.textContent?.includes('Confirmar presença'));
    button?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.feature()).toBe('attendance');
    expect((fixture.nativeElement as HTMLElement).querySelector('input')).not.toBeNull();
  });
});
