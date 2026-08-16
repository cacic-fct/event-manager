import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MarkdownPreviewDialogComponent } from '@cacic-fct/shared-angular';
import { of } from 'rxjs';
import { createPageStoryProviders, defaultPageStoryArgs, type PageStoryMode } from '../stories/page-story-support';
import { EventsPageComponent } from './events-page.component';

describe('EventsPageComponent', () => {
  it('allows removing linked attendance collectors when delete permission is granted', async () => {
    await configureComponent('populated');
    const { element } = createComponent();

    expect(button(element, 'Bruno Santos')).not.toBeNull();
  });

  it('shows linked attendance collectors without delete permission', async () => {
    await configureComponent('readonly');
    const { element } = createComponent();

    expect(element.textContent).toContain('Bruno Santos');
    expect(button(element, 'Bruno Santos')).toBeNull();
  });

  it('shows linked attendance collectors while viewing a draft', async () => {
    await configureComponent('drafts');
    const { element } = createComponent();

    expect(element.textContent).toContain('Bruno Santos');
    expect(button(element, 'Bruno Santos')).toBeNull();
  });

  it('shows the lecturer profile visibility toggle with lecturer options', async () => {
    await configureComponent('populated');
    const { element } = createComponent();

    expect(element.textContent).toContain('Exibir perfil de ministrante');
  });

  it('shows twemojis in major event and event group selection chips', async () => {
    await configureComponent('populated');
    const { element } = createComponent();

    expect(button(element, 'Semana da Computação')?.querySelector('lib-twemoji')).not.toBeNull();
    expect(button(element, 'Grupo')?.querySelector('lib-twemoji')).not.toBeNull();
  });

  it('previews the current unsaved event description', async () => {
    const dialog = { open: vi.fn() };
    await configureComponent('populated', dialog);
    const { element, fixture } = createComponent();
    fixture.componentInstance.workspace.eventForm.controls.description.setValue('**Texto ainda não salvo**');
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('button[aria-label="Pré-visualizar descrição"]')?.click();

    expect(dialog.open).toHaveBeenCalledWith(MarkdownPreviewDialogComponent, {
      data: {
        content: '**Texto ainda não salvo**',
        title: 'Pré-visualização da descrição do evento',
      },
      maxWidth: 'calc(100vw - 32px)',
    });
  });

  async function configureComponent(mode: PageStoryMode, dialog: Partial<MatDialog> = { open: vi.fn() }): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [EventsPageComponent],
      providers: [
        provideNoopAnimations(),
        ...createPageStoryProviders({
          ...defaultPageStoryArgs,
          mode,
        }),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({})),
          },
        },
      ],
    });
    TestBed.overrideProvider(MatDialog, { useValue: dialog });
    await TestBed.compileComponents();
  }

  function createComponent(): {
    element: HTMLElement;
    fixture: ComponentFixture<EventsPageComponent>;
  } {
    const fixture = TestBed.createComponent(EventsPageComponent);
    fixture.detectChanges();

    return {
      element: fixture.nativeElement as HTMLElement,
      fixture,
    };
  }
});

function button(element: HTMLElement, label: string): HTMLButtonElement | null {
  return [...element.querySelectorAll('button')].find((item) => item.textContent?.includes(label)) ?? null;
}
