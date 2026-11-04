import { ComponentFixture, TestBed } from '@angular/core/testing';
import { formatDateTime } from '@cacic-fct/shared-utils';
import { ParticipationStatusIcons } from './participation-status-icons';

describe('ParticipationStatusIcons', () => {
  let fixture: ComponentFixture<ParticipationStatusIcons>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ParticipationStatusIcons] }).compileComponents();
    fixture = TestBed.createComponent(ParticipationStatusIcons);
  });

  it('presents feed statuses in order with their existing accessible labels and icons', () => {
    fixture.componentRef.setInput(
      'statusLine',
      'Presença registrada em 1 de 2 eventos, Palestrante, Certificado emitido',
    );
    fixture.detectChanges();

    const icons = Array.from(fixture.nativeElement.querySelectorAll('.status-icon')) as HTMLElement[];
    expect(
      icons.map((icon) => [icon.getAttribute('aria-label'), icon.querySelector('mat-icon')?.textContent?.trim()]),
    ).toEqual([
      ['Presença registrada em 1 de 2 eventos', 'how_to_reg'],
      ['Palestrante', 'record_voice_over'],
      ['Certificado emitido', 'workspace_premium'],
    ]);
  });

  it('shows the formatted attendance time and both event status dimensions', () => {
    const attendanceAt = new Date(Date.now() + 86_400_000).toISOString();
    const formattedAttendanceAt = formatDateTime(attendanceAt);
    fixture.componentRef.setInput('eventStatus', {
      isSubscribed: true,
      attendanceAt,
    });
    fixture.detectChanges();

    const icons = Array.from(fixture.nativeElement.querySelectorAll('.status-icon')) as HTMLElement[];
    expect(icons.map((icon) => icon.getAttribute('aria-label'))).toEqual([
      `Presença registrada em ${formattedAttendanceAt}`,
      'Inscrito',
    ]);
    expect(fixture.nativeElement.querySelector('.status-timestamp')?.textContent.trim()).toBe(formattedAttendanceAt);
    expect(fixture.nativeElement.querySelectorAll('.status-row')).toHaveLength(2);
  });

  it('announces absent attendance and a non-subscription when an event has neither', () => {
    fixture.componentRef.setInput('eventStatus', { isSubscribed: false });
    fixture.detectChanges();

    const icons = Array.from(fixture.nativeElement.querySelectorAll('.status-icon')) as HTMLElement[];
    expect(icons.map((icon) => icon.getAttribute('aria-label'))).toEqual(['Sem presença registrada', 'Não inscrito']);
  });
});
