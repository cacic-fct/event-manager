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
            listCollectionEvents: () => of([]),
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
});
