import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
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
