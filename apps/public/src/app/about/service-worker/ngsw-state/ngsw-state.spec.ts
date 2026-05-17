import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { NgswState } from './ngsw-state';

describe('NgswState', () => {
  let component: NgswState;
  let fixture: ComponentFixture<NgswState>;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NgswState],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: MatDialogRef,
          useValue: {
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            close: () => {},
          },
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(NgswState);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    // Handle the initial HTTP request
    const req = httpTesting.expectOne('/app/ngsw/state');
    req.flush('Service Worker State');
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
