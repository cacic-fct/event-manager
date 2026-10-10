import { By } from '@angular/platform-browser';
import { MatAnchor } from '@angular/material/button';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, RouterLink, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { createPageStoryProviders, defaultPageStoryArgs } from '../stories/page-story-support';
import { EventGroupsPageComponent } from './event-groups-page.component';

describe('EventGroupsPageComponent', () => {
  async function createFixture() {
    await TestBed.configureTestingModule({
      imports: [EventGroupsPageComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        ...createPageStoryProviders(defaultPageStoryArgs),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({})) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(EventGroupsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('removes a linked activity without navigating or bubbling to the list', async () => {
    const fixture = await createFixture();
    const remove = vi.spyOn(fixture.componentInstance.workspace, 'removeEventFromSelectedGroup').mockResolvedValue(undefined);
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
    const fixture = await createFixture();
    const links = fixture.debugElement.queryAll(By.directive(RouterLink)).filter((link) =>
      link.injector.get(RouterLink).urlTree?.toString().includes('/event-workspace/event/'),
    );

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.injector.get(MatAnchor, null)).not.toBeNull();
      expect(link.nativeElement.getAttribute('href')).toMatch(/^\/event-workspace\/event\/[^/]+\/settings$/);
    }
  });

  it('shows identity and linked activities before access and certificate rules', async () => {
    const fixture = await createFixture();
    const element = fixture.nativeElement as HTMLElement;
    const headings = [...element.querySelectorAll('h4')].map((heading) => heading.textContent?.trim());
    expect(headings.indexOf('Dados principais')).toBeLessThan(headings.indexOf('Eventos do grupo'));
    expect(headings.indexOf('Eventos do grupo')).toBeLessThan(headings.indexOf('Acesso e participação'));
    expect(headings.indexOf('Presença')).toBeLessThan(headings.indexOf('Certificados'));
  });

  it('discloses dependent certificate rules when issuance is enabled', async () => {
    const fixture = await createFixture();
    const controls = fixture.componentInstance.workspace.eventGroupForm.controls;
    controls.shouldIssuePartialCertificate.setValue(true);
    controls.shouldIssueCertificate.setValue(false);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[formcontrolname="shouldIssuePartialCertificate"]')).toBeNull();
    controls.shouldIssueCertificate.setValue(true);
    fixture.detectChanges();
    expect(element.querySelector('#certificados [formcontrolname="shouldIssuePartialCertificate"]')).not.toBeNull();
  });

  it('keeps resource actions after removing the duplicate group catalog', async () => {
    const fixture = await createFixture();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('aside')).toBeNull();
    expect([...element.querySelectorAll('button')].some((button) => button.textContent?.includes('Mais ações'))).toBe(true);
    expect(element.querySelector('#certificados')).not.toBeNull();
  });
});
