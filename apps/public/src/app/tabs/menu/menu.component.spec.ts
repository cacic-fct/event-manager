import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { MenuComponent } from './menu.component';

describe('MenuComponent', () => {
  let component: MenuComponent;
  let fixture: ComponentFixture<MenuComponent>;
  let addEventListener: ReturnType<
    typeof vi.fn<(type: string, listener: EventListenerOrEventListenerObject) => void>
  >;
  let removeEventListener: ReturnType<
    typeof vi.fn<(type: string, listener: EventListenerOrEventListenerObject) => void>
  >;

  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn(),
    });
  });

  beforeEach(async () => {
    addEventListener = vi.fn<(type: string, listener: EventListenerOrEventListenerObject) => void>();
    removeEventListener = vi.fn<(type: string, listener: EventListenerOrEventListenerObject) => void>();
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener,
      removeEventListener,
      dispatchEvent: vi.fn(),
    }));

    await TestBed.configureTestingModule({
      imports: [MenuComponent],
      providers: [
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

    fixture = TestBed.createComponent(MenuComponent);
    component = fixture.componentInstance;

    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps preferences visible without account actions in the menu header', () => {
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('Preferências');
    expect(text).not.toContain('Editar informações da conta');
    expect(text).not.toContain('Sair da conta');
    expect(fixture.nativeElement.querySelector('a[href="https://account.cacic.dev.br/app/"]')).toBeNull();
  });

  it('should remove the color scheme listener on destroy', () => {
    const listener = addEventListener.mock.calls.find(([eventName]) => eventName === 'change')?.[1];

    expect(listener).toBeDefined();

    fixture.destroy();

    expect(removeEventListener).toHaveBeenCalledWith('change', listener);
  });
});
