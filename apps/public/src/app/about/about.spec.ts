import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
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

  it('renders the page title in the toolbar without a duplicate content heading', () => {
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('mat-toolbar h1')?.textContent).toContain('CACiC Eventos');
    expect(host.querySelector('.global-container h1')).toBeNull();
  });

  it('displays the deployed server version', () => {
    expect(fixture.nativeElement.textContent).toContain('Versão do servidor');
    expect(fixture.nativeElement.textContent).toContain('2026-07-19-1');
  });

  it('keeps the local version list row keyboard accessible without changing its Material host', () => {
    const easterEgg = vi.spyOn(component, 'easterEgg');
    const versionRow = fixture.nativeElement.querySelector('mat-list-item[role="button"]') as HTMLElement;

    expect(versionRow.tagName).toBe('MAT-LIST-ITEM');
    expect(versionRow.tabIndex).toBe(0);

    versionRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    versionRow.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    expect(easterEgg).toHaveBeenCalledTimes(2);
  });
});
