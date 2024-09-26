// import { ComponentFixture, TestBed } from '@angular/core/testing';
// import { PrivacyPage } from './privacy.page';
// import { PlausibleService } from '@notiz/ngx-plausible';
// import { AuthService } from 'src/app/shared/services/auth.service';
// import { of } from 'rxjs';

// class MockPlausibleService {
//   event() {}
// }

// class MockAuthService {
//   authState$ = of(null); // mock an observable that emits null (unauthenticated user)
// }

// describe('PrivacyPage', () => {
//   let component: PrivacyPage;
//   let fixture: ComponentFixture<PrivacyPage>;
//   let plausibleService: PlausibleService;
//   let authService: AuthService;

//   beforeEach(async () => {
//     await TestBed.configureTestingModule({
//       declarations: [PrivacyPage],
//       providers: [
//         { provide: PlausibleService, useClass: MockPlausibleService },
//         { provide: AuthService, useClass: MockAuthService },
//       ],
//     }).compileComponents();

//     fixture = TestBed.createComponent(PrivacyPage);
//     component = fixture.componentInstance;
//     plausibleService = TestBed.inject(PlausibleService);
//     authService = TestBed.inject(AuthService);

//     fixture.detectChanges();
//   });

//   it('should create', () => {
//     expect(component).toBeTruthy();
//   });

//   it('should disable analytics', () => {
//     component.isAnalyticsEnabled = true;
//     localStorage.setItem('disable-analytics', '');

//     component.toggleAnalytics();

//     expect(component.isAnalyticsEnabled).toBe(false);
//     expect(localStorage.getItem('disable-analytics')).toBe('true');
//   });

//   it('should enable analytics', () => {
//     component.isAnalyticsEnabled = false;
//     localStorage.setItem('disable-analytics', 'true');

//     component.toggleAnalytics();

//     expect(component.isAnalyticsEnabled).toBe(true);
//     expect(localStorage.getItem('disable-analytics')).toBe('');
//   });

//   it('should disable monitoring', () => {
//     component.isMonitoringEnabled = true;

//     component.toggleMonitoring();

//     expect(component.isMonitoringEnabled).toBe(false);
//     expect(localStorage.getItem('disable-monitoring')).toBe('true');
//   });

//   it('should enable monitoring', () => {
//     component.isMonitoringEnabled = false;

//     component.toggleMonitoring();

//     expect(component.isMonitoringEnabled).toBe(true);
//     expect(localStorage.getItem('disable-monitoring')).toBe('');
//   });
// });
