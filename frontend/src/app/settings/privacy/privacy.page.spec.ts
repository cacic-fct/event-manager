import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PrivacyPage } from './privacy.page';

describe('PrivacyPage', () => {
  let component: PrivacyPage;
  let fixture: ComponentFixture<PrivacyPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(PrivacyPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should disable analytics', () => {
    component.isAnalyticsEnabled = true;
    localStorage.setItem('disable-analytics', '');

    component.toggleAnalytics();

    expect(component.isAnalyticsEnabled).toBe(false);
    expect(localStorage.getItem('disable-analytics')).toBe('true');
  });

  it('should enable analytics', () => {
    component.isAnalyticsEnabled = false;
    localStorage.setItem('disable-analytics', 'true');

    component.toggleAnalytics();

    expect(component.isAnalyticsEnabled).toBe(true);
    expect(localStorage.getItem('disable-analytics')).toBe('');
  });

  it('should disable monitoring', () => {
    component.isMonitoringEnabled = true;

    component.toggleMonitoring();

    expect(component.isMonitoringEnabled).toBe(false);
    expect(localStorage.getItem('disable-monitoring')).toBe('true');
  });

  it('should enable monitoring', () => {
    component.isMonitoringEnabled = false;

    component.toggleMonitoring();

    expect(component.isMonitoringEnabled).toBe(true);
    expect(localStorage.getItem('disable-monitoring')).toBe('');
  });
});
