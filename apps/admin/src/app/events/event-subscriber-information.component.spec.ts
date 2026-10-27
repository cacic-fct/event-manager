import { MatDialog } from '@angular/material/dialog';
import { MarkdownPreviewDialogComponent } from '@cacic-fct/shared-angular';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { EventSubscriberInformationComponent } from './event-subscriber-information.component';
import { GraphqlHttpService } from '../graphql/graphql-http.service';
import { PermissionsService } from '../permissions/permissions.service';
import { WorkspacePendingChangesService } from '../app-shell/workspace-pending-changes.service';

describe('subscriber information editor', () => {
  const request = vi.fn();
  const dialog = { open: vi.fn() };
  beforeEach(() => {
    dialog.open.mockClear();
    request.mockReset().mockReturnValue(of({ eventSubscriberInformation: { content: 'Orientações anteriores' } }));
    TestBed.configureTestingModule({
      providers: [
        { provide: GraphqlHttpService, useValue: { request } },
        { provide: MatDialog, useValue: dialog },
        { provide: PermissionsService, useValue: { canEdit: () => true } },
        { provide: WorkspacePendingChangesService, useValue: { register: () => ({ set: vi.fn(), destroy: vi.fn() }) } },
      ],
    });
  });

  async function create() {
    const fixture = TestBed.createComponent(EventSubscriberInformationComponent);
    fixture.componentRef.setInput('eventId', 'event-1');
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('publishes subscriber information separately and leaves notifications off by default', async () => {
    const fixture = await create();
    fixture.componentInstance.model.set({ content: '[Reunião](https://example.org/reuniao)' });
    await fixture.componentInstance.save();
    expect(request.mock.calls.at(-1)?.[1]).toEqual({
      eventId: 'event-1',
      content: '[Reunião](https://example.org/reuniao)',
      notifySubscribers: false,
    });
    expect(fixture.componentInstance.changed()).toBe(false);
  });

  it('requires an explicit notification choice and resets it after publishing', async () => {
    const fixture = await create();
    fixture.componentInstance.notify.set(true);
    await fixture.componentInstance.save();
    expect(request.mock.calls.at(-1)?.[1].notifySubscribers).toBe(true);
    expect(fixture.componentInstance.notify()).toBe(false);
  });

  it('blocks writes in the read-only editor', async () => {
    const fixture = await create();
    fixture.componentRef.setInput('editable', false);
    fixture.detectChanges();
    const count = request.mock.calls.length;
    await fixture.componentInstance.save();
    expect(request).toHaveBeenCalledTimes(count);
  });

  it('shows the retry cooldown returned by the server and preserves the explicit notification choice', async () => {
    const fixture = await create();
    fixture.componentInstance.notify.set(true);
    request.mockReturnValueOnce(throwError(() => new Error('Aguarde cinco minutos após a última falha.')));

    await fixture.componentInstance.save();

    expect(fixture.componentInstance.saveError()).toBe('Aguarde cinco minutos após a última falha.');
    expect(fixture.componentInstance.notify()).toBe(true);
    expect(fixture.componentInstance.saving()).toBe(false);
  });

  it('ignores a response for a previously selected event', async () => {
    const old = new Subject<unknown>();
    request.mockReturnValueOnce(old);
    const fixture = TestBed.createComponent(EventSubscriberInformationComponent);
    fixture.componentRef.setInput('eventId', 'old-event');
    fixture.detectChanges();
    fixture.componentRef.setInput('eventId', 'new-event');
    fixture.detectChanges();
    await fixture.whenStable();
    old.next({ eventSubscriberInformation: { content: 'Stale content' } });
    old.complete();
    await fixture.whenStable();
    expect(fixture.componentInstance.model().content).toBe('Orientações anteriores');
  });
  it('opens the shared Markdown dialog with the current unsaved content', async () => {
    const fixture = await create();
    fixture.componentInstance.model.set({ content: '**Texto novo**' });
    fixture.componentInstance.preview();
    expect(dialog.open).toHaveBeenCalledWith(MarkdownPreviewDialogComponent, {
      data: { content: '**Texto novo**', title: 'Pré-visualização das informações para inscritos' },
      maxWidth: 'calc(100vw - 32px)',
    });
  });
});
