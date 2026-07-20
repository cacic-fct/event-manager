import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { About } from './about';
import { ServerVersionApiService } from './server-version-api.service';

describe('About', () => {
  let component: About;
  let fixture: ComponentFixture<About>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [About],
      providers: [
        provideRouter([]),
        {
          provide: ServerVersionApiService,
          useValue: { getServerVersion: () => of('2026-07-19-1') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(About);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('displays the deployed server version', () => {
    expect(fixture.nativeElement.textContent).toContain('Versão do servidor');
    expect(fixture.nativeElement.textContent).toContain('2026-07-19-1');
  });
});
