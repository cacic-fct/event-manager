import { By } from '@angular/platform-browser';
import { MatAnchor } from '@angular/material/button';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, RouterLink, convertToParamMap, provideRouter } from '@angular/router';
import { MarkdownPreviewDialogComponent } from '@cacic-fct/shared-angular';
import { of } from 'rxjs';
import { createPageStoryProviders, defaultPageStoryArgs } from '../stories/page-story-support';
import { MajorEventsPageComponent } from './major-events-page.component';
import { MajorEventsService } from './major-events.service';

describe('MajorEventsPageComponent', () => {
  async function createFixture(params: Record<string, string> = {}, data: Record<string, string> = {}) {
    const dialog = { open: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [MajorEventsPageComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        ...createPageStoryProviders(defaultPageStoryArgs),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap(params)), snapshot: { data } },
        },
      ],
    });
    TestBed.overrideProvider(MatDialog, { useValue: dialog });
    await TestBed.compileComponents();
    const pickMajorEventById = vi.spyOn(TestBed.inject(MajorEventsService), 'pickMajorEventById');
    const fixture: ComponentFixture<MajorEventsPageComponent> = TestBed.createComponent(MajorEventsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { dialog, fixture, pickMajorEventById };
  }

  it('loads the existing major event identified by workspace route metadata', async () => {
    const { pickMajorEventById } = await createFixture(
      { targetId: 'workspace-major' }, { targetType: 'major-event', section: 'settings' },
    );
    expect(pickMajorEventById).toHaveBeenCalledWith('workspace-major');
  });

  it('removes a linked activity without navigating or bubbling to the list', async () => {
    const fixture = (await createFixture()).fixture;
    const remove = vi.spyOn(fixture.componentInstance.workspace, 'removeEventFromSelectedMajorEvent').mockResolvedValue(undefined);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const record = (fixture.nativeElement as HTMLElement).querySelector('app-workspace-record');
    const action = record?.querySelector<HTMLButtonElement>('button[recordActions]');
    const rowClick = vi.fn();
    record?.parentElement?.addEventListener('click', rowClick);

    expect(action).not.toBeNull();
    action?.click();

    expect(remove).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
    expect(rowClick).not.toHaveBeenCalled();
  });

  it('renders linked activities as Material links to their event settings', async () => {
    const fixture = (await createFixture()).fixture;
    const links = fixture.debugElement.queryAll(By.directive(RouterLink)).filter((link) =>
      link.injector.get(RouterLink).urlTree?.toString().includes('/event-workspace/event/'),
    );

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.injector.get(MatAnchor, null)).not.toBeNull();
      expect(link.nativeElement.getAttribute('href')).toMatch(/^\/event-workspace\/event\/[^/]+\/settings$/);
    }
  });

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
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('mat-checkbox[formcontrolname="includesEventRegistration"]'),
    ).not.toBeNull();

    fixture.componentInstance.workspace.selectedMajorEvent.set({ ...selectedMajorEvent, sportsTournament: null });
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'mat-checkbox[formcontrolname="includesSportsRegistration"]',
      ),
    ).toBeNull();
  });
  it('keeps prices available when payment is optional and separates certificate policy from registrations', async () => {
    const { fixture } = await createFixture();
    const controls = fixture.componentInstance.workspace.majorEventForm.controls;
    const prices = fixture.componentInstance.workspace.priceTiers.getRawValue();
    controls.isPaymentRequired.setValue(false);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[formarrayname="priceTiers"] input')).not.toBeNull();
    expect(fixture.componentInstance.workspace.priceTiers.getRawValue()).toEqual(prices);
    expect(element.querySelector('#inscricao [formcontrolname="attendanceEligibility"]')).toBeNull();
    expect(element.querySelector('#presenca [formcontrolname="attendanceEligibility"]')).not.toBeNull();
    expect(element.querySelector('#certificados [formcontrolname="shouldIssueCertificateForNonPayingAttendees"]')).not.toBeNull();
  });

  it('links activities directly to their event editor', async () => {
    const { fixture } = await createFixture();
    const event = fixture.componentInstance.workspace.majorEventEvents()[0];
    expect(event).toBeDefined();
    expect((fixture.nativeElement as HTMLElement).querySelector(`a[href="/event-workspace/event/${event.id}/settings"]`)).not.toBeNull();
  });

});
