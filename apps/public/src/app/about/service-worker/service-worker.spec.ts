import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { provideRouter } from '@angular/router';
import { ServiceWorker } from './service-worker';

describe('ServiceWorker', () => {
  let component: ServiceWorker;
  let fixture: ComponentFixture<ServiceWorker>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServiceWorker],
      providers: [
        provideRouter([]),
        {
          provide: SwUpdate,
          useValue: {
            isEnabled: false,
            checkForUpdate: () => Promise.resolve(false),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ServiceWorker);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
