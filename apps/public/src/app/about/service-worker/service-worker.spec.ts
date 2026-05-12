import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ServiceWorker } from './service-worker';

describe('ServiceWorker', () => {
  let component: ServiceWorker;
  let fixture: ComponentFixture<ServiceWorker>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServiceWorker],
    }).compileComponents();

    fixture = TestBed.createComponent(ServiceWorker);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
