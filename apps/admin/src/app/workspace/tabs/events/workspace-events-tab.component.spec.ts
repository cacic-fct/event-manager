import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import {
  createWorkspaceTabStoryProviders,
  defaultWorkspaceTabStoryArgs,
  type WorkspaceTabStoryMode,
} from '../workspace-tab-story-support';
import { WorkspaceEventsTabComponent } from './workspace-events-tab.component';

describe('WorkspaceEventsTabComponent', () => {
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

  async function configureComponent(mode: WorkspaceTabStoryMode): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [WorkspaceEventsTabComponent],
      providers: [
        provideNoopAnimations(),
        ...createWorkspaceTabStoryProviders({
          ...defaultWorkspaceTabStoryArgs,
          mode,
        }),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({})),
          },
        },
      ],
    }).compileComponents();
  }

  function createComponent(): {
    element: HTMLElement;
    fixture: ComponentFixture<WorkspaceEventsTabComponent>;
  } {
    const fixture = TestBed.createComponent(WorkspaceEventsTabComponent);
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
