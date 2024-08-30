import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { ServiceWorkerStatusModalComponent } from './service-worker-status-modal.component';

describe('ServiceWorkerStatusModalComponent', () => {
  let component: ServiceWorkerStatusModalComponent;
  let fixture: ComponentFixture<ServiceWorkerStatusModalComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [ServiceWorkerStatusModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ServiceWorkerStatusModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
