import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { ServiceWorkerService } from '@cacic-fct/shared-angular';
import { NgswState } from './ngsw-state';

describe('NgswState', () => {
  let component: NgswState;
  let fixture: ComponentFixture<NgswState>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NgswState],
      providers: [
        {
          provide: MatDialogRef,
          useValue: {
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            close: () => {},
          },
        },
        {
          provide: ServiceWorkerService,
          useValue: {
            getDebugState: () => Promise.resolve('Service Worker State'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NgswState);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
