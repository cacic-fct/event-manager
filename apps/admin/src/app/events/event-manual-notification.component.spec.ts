import { TestBed } from '@angular/core/testing';
import { EventPreparationApiService } from '@cacic-fct/shared-angular/event-preparation';
import { WorkspacePendingChangesService } from '../app-shell/workspace-pending-changes.service';
import { EventManualNotificationComponent } from './event-manual-notification.component';

describe('manual event message composer', () => {
  const notifyParticipants = vi.fn();
  beforeEach(() => {
    notifyParticipants.mockReset().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: EventPreparationApiService, useValue: { notifyParticipants } },
        { provide: WorkspacePendingChangesService, useValue: { register: () => ({ set: vi.fn(), destroy: vi.fn() }) } },
      ],
    });
  });
  async function create() {
    const fixture = TestBed.createComponent(EventManualNotificationComponent);
    fixture.componentRef.setInput('eventId', 'event');
    fixture.componentRef.setInput('eventName', 'Evento de teste');
    fixture.componentRef.setInput('editable', true);
    fixture.componentRef.setInput('published', true);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }
  it('requires reviewing a complete message and includes event/audience in the preview', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.model.set({ audience: 'SUBSCRIBERS', message: ' Em Evento de teste, a sala mudou. ' });
    await component.send();
    expect(notifyParticipants).not.toHaveBeenCalled();
    component.review();
    fixture.detectChanges();
    expect(component.preview()).toEqual(
      expect.objectContaining({
        eventId: 'event',
        eventName: 'Evento de teste',
        audience: 'SUBSCRIBERS',
        message: 'Em Evento de teste, a sala mudou.',
      }),
    );
    expect(fixture.nativeElement.textContent).toContain('Inscritos no evento');
    await component.send();
    expect(notifyParticipants).toHaveBeenCalledWith(
      'event',
      'SUBSCRIBERS',
      'Em Evento de teste, a sala mudou.',
      expect.any(String),
    );
    expect(component.model().message).toBe('');
    expect(component.feedback()).toContain('agendado');
  });
  it('retains the reviewed request ID after a connection error so retrying does not create duplicate messages', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.model.set({ audience: 'LECTURERS', message: 'Evento de teste: novo local.' });
    component.review();
    notifyParticipants.mockRejectedValueOnce(new Error('Conexão interrompida'));
    await component.send();
    expect(component.error()).toContain('Conexão');
    await component.send();
    expect(notifyParticipants.mock.calls[0]).toEqual(notifyParticipants.mock.calls[1]);
  });
  it('blocks read-only sends, blank messages, and subscriber messages for draft events', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.model.set({ audience: 'LECTURERS', message: '  ' });
    component.review();
    expect(component.preview()).toBeNull();
    fixture.componentRef.setInput('published', false);
    component.model.set({ audience: 'SUBSCRIBERS', message: 'Mensagem' });
    fixture.detectChanges();
    component.review();
    expect(component.preview()).toBeNull();
    fixture.componentRef.setInput('editable', false);
    component.model.set({ audience: 'LECTURERS', message: 'Mensagem' });
    fixture.detectChanges();
    component.review();
    await component.send();
    expect(notifyParticipants).not.toHaveBeenCalled();
  });
  it('shows practical writing guidance and resets its draft when switching events', async () => {
    const fixture = await create();
    expect(fixture.nativeElement.textContent).toContain('Inclua o nome do evento');
    fixture.componentInstance.model.set({ audience: 'LECTURERS', message: 'Evento anterior' });
    fixture.componentInstance.review();
    fixture.componentRef.setInput('eventId', 'another');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.preview()).toBeNull();
    expect(fixture.componentInstance.model().message).toBe('');
  });
});
