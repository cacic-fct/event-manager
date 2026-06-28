import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AttendanceOfflineQueueService } from '@cacic-fct/offline-public-data-access';
import { AuthService } from '@cacic-fct/shared-angular';
import { AttendanceCollectionApiService } from './attendance-collection-api.service';
import { ScannerEventList } from './scanner-event-list';

describe('ScannerEventList', () => {
  let component: ScannerEventList;
  let fixture: ComponentFixture<ScannerEventList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScannerEventList],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            user: () => ({ sub: 'collector-1' }),
          },
        },
        {
          provide: AttendanceOfflineQueueService,
          useValue: {
            replaceCollectionEvents: () => Promise.resolve(),
            getCollectionEvents: () => Promise.resolve([]),
          },
        },
        {
          provide: AttendanceCollectionApiService,
          useValue: {
            listCollectionEvents: () =>
              of([
                {
                  eventId: 'event-1',
                  event: {
                    id: 'event-1',
                    name: 'Oficina de testes',
                    startDate: '2026-06-27T13:00:00',
                    endDate: '2026-06-27T15:00:00',
                    emoji: '🧪',
                    type: 'MINICURSO',
                    locationDescription: 'Laboratório 3',
                    shouldCollectAttendance: true,
                    publiclyVisible: true,
                    queueCount: 0,
                  },
                },
              ]),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ScannerEventList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows event hours, location, and attendance collection window', () => {
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Oficina de testes');
    expect(text).toContain('Laboratório 3');
    expect(text).toContain('Coleta de presença: 10:00-21:00');
    expect(text).toContain('13:00');
    expect(text).toContain('15:00');
  });
});
