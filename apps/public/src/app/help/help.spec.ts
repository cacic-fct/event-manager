import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { AuthService, MailtoService } from '@cacic-fct/shared-angular';
import { Help } from './help';

describe('Help', () => {
  let component: Help;
  let fixture: ComponentFixture<Help>;

  const composeSpy = vi.fn(() => 'mailto:fctapp@googlegroups.com?subject=support');

  const userMock = vi.fn<() => { sub: string } | null>();

  beforeEach(async () => {
    composeSpy.mockClear();
    userMock.mockReset();
    userMock.mockReturnValue({ sub: 'user-123' });

    await TestBed.configureTestingModule({
      imports: [Help],
      providers: [
        provideRouter([]),
        {
          provide: MailtoService,
          useValue: {
            compose: composeSpy,
          },
        },
        {
          provide: AuthService,
          useValue: {
            user: userMock,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Help);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render documentation link', () => {
    const link: HTMLAnchorElement | null = fixture.nativeElement.querySelector(
      'a[href="https://docs.eventos.cacic.com.br"]',
    );

    expect(link).not.toBeNull();
    expect(link?.textContent).toContain('Documentação e manual de uso');
  });

  it('should render bug report link', () => {
    const link: HTMLAnchorElement | null = fixture.nativeElement.querySelector(
      'a[href="https://github.com/cacic-fct/event-manager/issues/new/choose"]',
    );

    expect(link).not.toBeNull();
    expect(link?.textContent).toContain('Reportar um bug');
  });

  it('renders a support mail link with the current user id', () => {
    const supportLink: HTMLAnchorElement | null = fixture.nativeElement.querySelector(
      'a[href^="mailto:fctapp@googlegroups.com"]',
    );

    expect(supportLink).not.toBeNull();
    expect(supportLink?.textContent).toContain('Suporte ao usuário');
    expect(composeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'fctapp@googlegroups.com',
        subject: '[FCT-App] Suporte ao usuário',
        body: expect.stringContaining('userId: user-123'),
      }),
    );
  });

  it('uses a fallback user id when the current user is null', () => {
    userMock.mockReturnValue(null);

    component.mailtoHref();

    expect(composeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('userId: Desconhecido'),
      }),
    );
  });

});
