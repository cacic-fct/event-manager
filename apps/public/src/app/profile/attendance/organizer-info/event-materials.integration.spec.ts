import { TestBed } from '@angular/core/testing';
import {
  EventInstructionsComponent,
  EventMaterialsComponent,
  EventPreparationApiService,
} from '@cacic-fct/shared-angular/event-preparation';

describe('shared event materials editor', () => {
  const api = { getMaterials: vi.fn(), saveMaterials: vi.fn(), notifyParticipants: vi.fn() };
  beforeEach(() => {
    api.getMaterials.mockReset().mockResolvedValue({ links: [], updatedAt: null });
    api.saveMaterials
      .mockReset()
      .mockImplementation(async (_eventId, links) => ({ links, updatedAt: new Date().toISOString() }));
    api.notifyParticipants.mockReset();
    TestBed.configureTestingModule({ providers: [{ provide: EventPreparationApiService, useValue: api }] });
  });
  async function create(editable = true) {
    const fixture = TestBed.createComponent(EventMaterialsComponent);
    fixture.componentRef.setInput('eventId', 'event');
    fixture.componentRef.setInput('editable', editable);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }
  it('hides empty reader materials and empty team guidance, while retaining the editing affordance', async () => {
    const subscriber = await create(false);
    subscriber.detectChanges();
    expect(subscriber.nativeElement.hidden).toBe(true);
    subscriber.componentRef.setInput('editable', true);
    subscriber.detectChanges();
    await subscriber.whenStable();
    subscriber.detectChanges();
    expect(subscriber.nativeElement.hidden).toBe(false);
    const instructions = TestBed.createComponent(EventInstructionsComponent);
    instructions.componentRef.setInput('content', '  ');
    instructions.detectChanges();
    expect(instructions.nativeElement.hidden).toBe(true);
    expect(instructions.nativeElement.textContent.trim()).toBe('');
    instructions.componentRef.setInput('content', '**Sala 3**');
    instructions.detectChanges();
    expect(instructions.nativeElement.hidden).toBe(false);
  });

  it('shares links and never calls notifications', async () => {
    const fixture = await create();
    fixture.componentInstance.model.set({ links: [{ title: ' Slides ', url: 'https://example.org/slides' }] });
    await fixture.componentInstance.save();
    expect(api.saveMaterials).toHaveBeenCalledWith(
      'event',
      [{ title: 'Slides', url: 'https://example.org/slides' }],
      null,
    );
    expect(api.notifyParticipants).not.toHaveBeenCalled();
    expect(fixture.componentInstance.changed()).toBe(false);
  });
  it('saves per-link event-end release choices and refreshes subscribers at the server release boundary', async () => {
    const fixture = await create();
    vi.useFakeTimers();
    try {
      fixture.componentInstance.model.set({ links: [{ title: 'Respostas', url: 'https://example.org/respostas' }] });
      fixture.componentInstance.setReleaseAfterEvent(0, true);
      await fixture.componentInstance.save();
      expect(api.saveMaterials).toHaveBeenCalledWith(
        'event',
        [{ title: 'Respostas', url: 'https://example.org/respostas', releaseAfterEvent: true }],
        null,
      );
      const release = new Date(Date.now() + 1000).toISOString();
      api.getMaterials.mockResolvedValueOnce({ links: [], updatedAt: null, nextReleaseAt: release });
      fixture.componentRef.setInput('editable', false);
      fixture.detectChanges();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1300);
      expect(api.getMaterials).toHaveBeenLastCalledWith('event', false);
      expect(api.getMaterials).toHaveBeenCalledTimes(3);
      fixture.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects unsafe links and keeps a draft after an optimistic-concurrency failure', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.model.set({ links: [{ title: 'Unsafe', url: 'javascript:alert(1)' }] });
    await component.save();
    expect(api.saveMaterials).not.toHaveBeenCalled();
    component.model.set({ links: [{ title: 'Slides', url: 'https://example.org/slides' }] });
    api.saveMaterials.mockRejectedValueOnce(new Error('Recarregue antes de salvar novamente.'));
    await component.save();
    expect(component.changed()).toBe(true);
    expect(component.error()).toContain('Recarregue');
  });
  it('uses subscriber authorization for participants and administrative authorization for read-only admins', async () => {
    const fixture = await create(false);
    expect(api.getMaterials).toHaveBeenLastCalledWith('event', false);
    fixture.componentRef.setInput('management', true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(api.getMaterials).toHaveBeenLastCalledWith('event', true);
    await fixture.componentInstance.save();
    expect(api.saveMaterials).not.toHaveBeenCalled();
  });
  it('ignores a response from the event that was open before switching context', async () => {
    let resolveOld!: (value: { links: { title: string; url: string }[]; updatedAt: null }) => void;
    api.getMaterials.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
    );
    const fixture = TestBed.createComponent(EventMaterialsComponent);
    fixture.componentRef.setInput('eventId', 'old');
    fixture.componentRef.setInput('editable', true);
    fixture.detectChanges();
    fixture.componentRef.setInput('eventId', 'new');
    fixture.detectChanges();
    resolveOld({ links: [{ title: 'Old secret', url: 'https://example.org/old' }], updatedAt: null });
    await fixture.whenStable();
    expect(fixture.componentInstance.model().links).toEqual([]);
  });
});
