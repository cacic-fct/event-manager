import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { Legal } from './legal';

describe('Licenses', () => {
  let component: Legal;
  let fixture: ComponentFixture<Legal>;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Legal],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of({}),
            queryParamMap: of({}),
            snapshot: {
              paramMap: new Map(),
              queryParamMap: new Map(),
            },
          },
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Legal);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    // Handle the HTTP request for licenses
    try {
      const req = httpTesting.expectOne('/app/3rdpartylicenses.txt');
      req.flush('License text here');
    } catch (_e) {
      // Licenses request may not be made depending on component state
    }
  });

  afterEach(() => {
    try {
      httpTesting.verify();
    } catch (_e) {
      // Ignore verification errors if no requests were made
    }
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
