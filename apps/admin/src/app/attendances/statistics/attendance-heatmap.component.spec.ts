import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AttendanceHeatmapComponent } from './attendance-heatmap.component';

describe('AttendanceHeatmapComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
  });

  it('explains why the map is empty when neither scans nor event coordinates are available', () => {
    const fixture = TestBed.createComponent(AttendanceHeatmapComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.hasLocationData()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Nenhuma presença desta janela contém localização.');
    expect(fixture.nativeElement.querySelector('[role="img"]')).toBeNull();
  });

  it('keeps the map region available when only the known event location can anchor it', () => {
    const fixture = TestBed.createComponent(AttendanceHeatmapComponent);
    fixture.componentRef.setInput('eventLatitude', -20.76162);
    fixture.componentRef.setInput('eventLongitude', -41.53316);
    fixture.detectChanges();

    expect(fixture.componentInstance.hasLocationData()).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Mapa de calor dos locais onde as presenças foram coletadas',
    );
  });

  it('accepts scan locations without requiring an event coordinate', () => {
    const fixture = TestBed.createComponent(AttendanceHeatmapComponent);
    fixture.componentRef.setInput('points', [
      { latitude: -20.76, longitude: -41.53, count: 4, averageAccuracyMeters: 12 },
    ]);
    fixture.detectChanges();

    expect(fixture.componentInstance.hasLocationData()).toBe(true);
  });
});
