import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { AuthService, MailtoService } from '@cacic-fct/shared-angular';
import { Help } from './help';

describe('Help', () => {
  let component: Help;
  let fixture: ComponentFixture<Help>;

  const openSpy = vi.fn();

  const userMock = vi.fn<() => { sub: string } | null>();

  beforeEach(async () => {
    openSpy.mockReset();
    userMock.mockReset();
    userMock.mockReturnValue({ sub: 'user-123' });

    await TestBed.configureTestingModule({
      imports: [Help],
      providers: [
        provideRouter([]),
        {
          provide: MailtoService,
          useValue: {
            open: openSpy,
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
      'a[href="https://docs.fctapp.cacic.dev.br"]',
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

  it('should open support email with current user id', () => {
    component.mailto();

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'fctapp@googlegroups.com',
        subject: '[FCT-App] Suporte ao usuário',
        body: expect.stringContaining('userId: user-123'),
      }),
    );
  });

  it('should open support email with fallback user id when user is null', () => {
    userMock.mockReturnValue(null);

    component.mailto();

    expect(openSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('userId: Desconhecido'),
      }),
    );
  });

  it('should call mailto when support item is clicked', () => {
    const mailtoSpy = vi.spyOn(component, 'mailto');

    const supportLink = fixture.debugElement
      .queryAll(By.css('a[mat-list-item]'))
      .find((el) => el.nativeElement.textContent.includes('Suporte ao usuário'));

    expect(supportLink).toBeDefined();

    supportLink?.nativeElement.click();

    expect(mailtoSpy).toHaveBeenCalledTimes(1);
  });
});
