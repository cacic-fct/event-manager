import { TestBed } from '@angular/core/testing';
import { EventPreparationApiService } from '@cacic-fct/shared-angular/event-preparation';
import { PermissionsService } from '../permissions/permissions.service';
import { WorkspacePendingChangesService } from '../app-shell/workspace-pending-changes.service';
import { EventPreparationComponent } from './event-preparation.component';

const empty = { lecturerInformation: null, collectorInformation: null, updatedAt: null };
describe('event team instruction editor', () => {
  const api = {
    getPreparation: vi.fn(),
    savePreparation: vi.fn(),
    getMaterials: vi.fn(async () => ({ links: [], updatedAt: null })),
  };
  beforeEach(() => {
    api.getPreparation.mockReset().mockResolvedValue(empty);
    api.savePreparation
      .mockReset()
      .mockImplementation(async (_id, input) => ({ ...input, updatedAt: new Date().toISOString() }));
    TestBed.configureTestingModule({
      providers: [
        { provide: EventPreparationApiService, useValue: api },
        { provide: PermissionsService, useValue: { canEdit: () => true } },
        { provide: WorkspacePendingChangesService, useValue: { register: () => ({ set: vi.fn(), destroy: vi.fn() }) } },
      ],
    });
  });
  async function create() {
    const fixture = TestBed.createComponent(EventPreparationComponent);
    fixture.componentRef.setInput('eventId', 'event');
    fixture.componentRef.setInput('editable', true);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }
  it('saves lecturer and collector Markdown together, retaining the server revision', async () => {
    const fixture = await create();
    fixture.componentInstance.model.set({
      lecturerInformation: '**Sala 3**',
      collectorInformation: '- Conferir evento',
    });
    await fixture.componentInstance.save();
    expect(api.savePreparation).toHaveBeenCalledWith('event', {
      lecturerInformation: '**Sala 3**',
      collectorInformation: '- Conferir evento',
      updatedAt: null,
    });
    expect(fixture.componentInstance.changed()).toBe(false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(api.getPreparation).toHaveBeenCalledTimes(1);
  });
  it('preserves drafts after a conflict and never writes when read-only', async () => {
    const fixture = await create();
    fixture.componentInstance.model.set({ lecturerInformation: 'Minha alteração', collectorInformation: '' });
    api.savePreparation.mockRejectedValueOnce(new Error('Recarregue antes de salvar novamente.'));
    await fixture.componentInstance.save();
    expect(fixture.componentInstance.changed()).toBe(true);
    expect(fixture.componentInstance.model().lecturerInformation).toBe('Minha alteração');
    fixture.componentRef.setInput('editable', false);
    fixture.detectChanges();
    await fixture.componentInstance.save();
    expect(api.savePreparation).toHaveBeenCalledTimes(1);
  });
});
