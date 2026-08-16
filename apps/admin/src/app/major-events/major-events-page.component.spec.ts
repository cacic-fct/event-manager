import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { MarkdownPreviewDialogComponent } from '@cacic-fct/shared-angular';
import { of } from 'rxjs';
import { createPageStoryProviders, defaultPageStoryArgs } from '../stories/page-story-support';
import { MajorEventsPageComponent } from './major-events-page.component';

describe('MajorEventsPageComponent', () => {
  async function createFixture() {
    const dialog = { open: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [MajorEventsPageComponent],
      providers: [
        provideNoopAnimations(),
        ...createPageStoryProviders(defaultPageStoryArgs),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({})) },
        },
      ],
    });
    TestBed.overrideProvider(MatDialog, { useValue: dialog });
    await TestBed.compileComponents();
    const fixture: ComponentFixture<MajorEventsPageComponent> = TestBed.createComponent(MajorEventsPageComponent);
    fixture.detectChanges();
    return { dialog, fixture };
  }

  it('previews the current unsaved major-event description', async () => {
    const { dialog, fixture } = await createFixture();
    fixture.componentInstance.workspace.majorEventForm.controls.description.setValue('## Programação atualizada');
    fixture.detectChanges();

    const preview = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Pré-visualizar descrição"]',
    );
    preview?.click();

    expect(preview).not.toBeNull();
    expect(dialog.open).toHaveBeenCalledWith(MarkdownPreviewDialogComponent, {
      data: {
        content: '## Programação atualizada',
        title: 'Pré-visualização da descrição do grande evento',
      },
      maxWidth: 'calc(100vw - 32px)',
    });
  });

  it('shows the sports-registration tier option only for a major event linked to a tournament', async () => {
    const { fixture } = await createFixture();
    const selectedMajorEvent = fixture.componentInstance.workspace.selectedMajorEvent();
    if (!selectedMajorEvent) {
      throw new Error('Expected the story fixture to select a major event');
    }

    fixture.componentInstance.workspace.selectedMajorEvent.set({
      ...selectedMajorEvent,
      sportsTournament: { id: 'sports-tournament-1' },
    });
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'mat-checkbox[formcontrolname="includesSportsRegistration"]',
      ),
    ).not.toBeNull();

    fixture.componentInstance.workspace.selectedMajorEvent.set({ ...selectedMajorEvent, sportsTournament: null });
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'mat-checkbox[formcontrolname="includesSportsRegistration"]',
      ),
    ).toBeNull();
  });
});
