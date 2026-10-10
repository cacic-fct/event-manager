import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { provideDateFnsAdapter } from '@angular/material-date-fns-adapter';
import { MarkdownPreviewDialogComponent } from '@cacic-fct/shared-angular';
import { of } from 'rxjs';
import { Permission } from '@cacic-fct/shared-permissions';
import { PermissionsService } from '../permissions/permissions.service';
import { LocationCoordinatePickerDialogComponent } from '../app-shell/dialogs/location-coordinate-picker-dialog.component';
import { createPageStoryProviders, defaultPageStoryArgs, type PageStoryMode } from '../stories/page-story-support';
import { EventsPageComponent } from './events-page.component';

describe('EventsPageComponent', () => {
  it('allows removing linked attendance collectors when delete permission is granted', async () => {
    await configureComponent('populated');
    const { element } = await createComponent();

    expect(button(element, 'Bruno Santos')).not.toBeNull();
  });

  it('shows linked attendance collectors without delete permission', async () => {
    await configureComponent('readonly');
    const { element } = await createComponent();

    expect(element.textContent).toContain('Bruno Santos');
    expect(button(element, 'Bruno Santos')).toBeNull();
  });

  it('shows linked attendance collectors while viewing a draft', async () => {
    await configureComponent('drafts');
    const { element } = await createComponent();

    expect(element.textContent).toContain('Bruno Santos');
    expect(button(element, 'Bruno Santos')).toBeNull();
  });

  it('shows the lecturer profile visibility toggle with lecturer options', async () => {
    await configureComponent('populated');
    const { element } = await createComponent();

    expect(element.textContent).toContain('Exibir perfil de ministrante');
  });

  it('shows twemojis in major event and event group selection chips', async () => {
    await configureComponent('populated');
    const { element } = await createComponent();

    expect(button(element, 'Semana da Computação')?.querySelector('lib-twemoji')).not.toBeNull();
    expect(button(element, 'Grupo')?.querySelector('lib-twemoji')).not.toBeNull();
  });

  it('previews the current unsaved event description', async () => {
    const dialog = { open: vi.fn() };
    await configureComponent('populated', dialog);
    const { element, fixture } = await createComponent();
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

  it('copies coordinates confirmed in the map picker into the event form', async () => {
    const dialog = {
      open: vi.fn().mockReturnValue({
        afterClosed: () => of({ latitude: -22.12103, longitude: -51.40775 }),
      }),
    };
    await configureComponent('populated', dialog);
    const { element, fixture } = await createComponent();

    button(element, 'Selecionar no mapa')?.click();

    expect(dialog.open).toHaveBeenCalledWith(LocationCoordinatePickerDialogComponent, {
      data: { coordinates: { latitude: -22.1211, longitude: -51.4086 } },
      maxWidth: 'calc(100vw - 32px)',
    });
    expect(fixture.componentInstance.workspace.eventForm.controls.latitude.value).toBe('-22.12103');
    expect(fixture.componentInstance.workspace.eventForm.controls.longitude.value).toBe('-51.40775');
  });

  it('disables publication while the event editor is invalid', async () => {
    await configureComponent('populated');
    const { element, fixture } = await createComponent();
    fixture.componentInstance.workspace.eventForm.controls.name.setValue('');
    fixture.detectChanges();

    const publishButton = [...element.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('Atualizar publicação'),
    ) as HTMLButtonElement | undefined;

    expect(publishButton?.disabled).toBe(true);
  });

  it('retains linked lecturer names when viewing a draft or without delete permission', async () => {
    await configureComponent('readonly');
    const { element, fixture } = await createComponent();
    const lecturer = fixture.componentInstance.workspace.eventLecturers()[0];

    expect(element.querySelector('.linked-person')?.textContent).toContain(lecturer.name);
    expect(button(element, lecturer.name)).toBeNull();
  });

  it('leaves participation navigation to the contextual shell', async () => {
    await configureComponent('populated');
    const permissions = TestBed.inject(PermissionsService);
    const has = permissions.has.bind(permissions);
    vi.spyOn(permissions, 'has').mockImplementation((scope) =>
      scope === Permission.Subscription.Read || scope === Permission.EventAttendance.Read || has(scope),
    );
    const { element, fixture } = await createComponent();
    const eventId = fixture.componentInstance.workspace.selectedEvent()?.id;
    expect(eventId).toBeDefined();
    expect(element.querySelector(`a[href="/subscriptions/event/${eventId}"]`)).toBeNull();
    expect(element.querySelector(`a[href="/attendances/event/${eventId}"]`)).toBeNull();
  });

  it('discloses online attendance fields without losing the entered code', async () => {
    await configureComponent('populated');
    const { element, fixture } = await createComponent();
    const controls = fixture.componentInstance.workspace.eventForm.controls;
    controls.onlineAttendanceCode.setValue('PRESERVAR');
    controls.isOnlineAttendanceAllowed.setValue(false);
    fixture.detectChanges();
    expect(element.querySelector('input[formcontrolname="onlineAttendanceCode"]')).toBeNull();

    controls.isOnlineAttendanceAllowed.setValue(true);
    fixture.detectChanges();
    expect(element.querySelector<HTMLInputElement>('input[formcontrolname="onlineAttendanceCode"]')?.value).toBe('PRESERVAR');
  });

  it('keeps oral collection and certificate exceptions with their enabling policy', async () => {
    await configureComponent('populated');
    const { element, fixture } = await createComponent();
    const controls = fixture.componentInstance.workspace.eventForm.controls;
    controls.shouldCollectAttendance.setValue(false);
    controls.shouldIssueCertificate.setValue(false);
    fixture.detectChanges();
    expect(element.querySelector('[formcontrolname="shouldAllowOralAttendance"]')).toBeNull();
    expect(element.querySelector('[formcontrolname="shouldIssueCertificateForNonSubscribedAttendees"]')).toBeNull();

    controls.shouldCollectAttendance.setValue(true);
    controls.shouldIssueCertificate.setValue(true);
    fixture.detectChanges();
    expect(element.querySelector('#presenca [formcontrolname="shouldAllowOralAttendance"]')).not.toBeNull();
    expect(element.querySelector('#certificados [formcontrolname="shouldIssueCertificateForNonSubscribedAttendees"]')).not.toBeNull();
    expect(element.querySelector('#inscricao [formcontrolname="attendanceEligibility"]')).toBeNull();
  });

  it('keeps resource actions after removing the duplicate event catalog', async () => {
    await configureComponent('populated');
    const { element } = await createComponent();
    expect(element.querySelector('aside')).toBeNull();
    expect(element.querySelector('app-event-filter-panel')).toBeNull();
    expect(button(element, 'Mais ações')).not.toBeNull();
    expect(button(element, 'Histórico')).not.toBeNull();
  });

  async function configureComponent(
    mode: PageStoryMode,
    dialog: Partial<MatDialog> = { open: vi.fn() },
  ): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [EventsPageComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideDateFnsAdapter(),
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

  async function createComponent(): Promise<{
    element: HTMLElement;
    fixture: ComponentFixture<EventsPageComponent>;
  }> {
    const fixture = TestBed.createComponent(EventsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
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
