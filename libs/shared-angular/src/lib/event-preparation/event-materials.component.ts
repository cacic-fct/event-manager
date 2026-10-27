import { isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, PLATFORM_ID, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormField, applyEach, disabled, form, maxLength } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { parseEventMaterials, MAX_EVENT_MATERIALS, type EventMaterial } from '@cacic-fct/shared-event-preparation';
import { EventPreparationApiService } from './event-preparation-api.service';

@Component({
  selector: 'lib-event-materials',
  imports: [
    FormField,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  templateUrl: './event-materials.component.html',
  styleUrl: './event-materials.component.scss',
  host: { '[hidden]': '!editable() && !loading() && !loadError() && original().length === 0' },
})
export class EventMaterialsComponent {
  readonly eventId = input.required<string>();
  readonly eventName = input('');
  readonly editable = input(false);
  readonly management = input(false);
  readonly dirtyChange = output<boolean>();
  private readonly api = inject(EventPreparationApiService);
  private readonly platformId = inject(PLATFORM_ID);
  private releaseTimer: ReturnType<typeof setTimeout> | undefined;
  readonly model = signal<{ links: EventMaterial[] }>({ links: [] });
  readonly fields = form(this.model, (schema) => {
    disabled(schema.links, () => this.saving() || !this.editable());
    applyEach(schema.links, (link) => {
      maxLength(link.title, 200);
      maxLength(link.url, 2048);
    });
  });
  readonly original = signal<EventMaterial[]>([]);
  private revision: string | null = null;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly loadError = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly maximum = MAX_EVENT_MATERIALS;
  readonly changed = computed(() => JSON.stringify(this.model().links) !== JSON.stringify(this.original()));
  readonly validationError = computed(() => {
    try {
      parseEventMaterials(this.model().links);
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : 'Revise os materiais.';
    }
  });
  private request = 0;

  constructor() {
    effect(() => {
      this.eventId();
      this.editable();
      this.management();
      void this.load();
    });
    effect(() => this.dirtyChange.emit(this.changed() || this.saving()));
    inject(DestroyRef).onDestroy(() => {
      this.request++;
      clearTimeout(this.releaseTimer);
    });
  }

  async load({ background = false }: { background?: boolean } = {}): Promise<void> {
    const request = ++this.request;
    clearTimeout(this.releaseTimer);
    const eventId = this.eventId();
    if (!background) {
      this.loading.set(true);
      this.saving.set(false);
      this.loadError.set(false);
      this.error.set('');
      this.message.set('');
      this.original.set([]);
      this.model.set({ links: [] });
    }
    try {
      const result = await this.api.getMaterials(eventId, this.editable() || this.management());
      if (request !== this.request) return;
      const links = parseEventMaterials(result?.links ?? []);
      this.revision = result?.updatedAt ?? null;
      this.original.set(links);
      this.model.set({ links: links.map((link) => ({ ...link })) });
      if (!this.editable() && !this.management() && result?.nextReleaseAt && isPlatformBrowser(this.platformId)) {
        const delay = new Date(result.nextReleaseAt).getTime() - Date.now() + 250;
        if (Number.isFinite(delay)) {
          this.releaseTimer = setTimeout(
            () => void this.load({ background: true }),
            Math.min(Math.max(delay, 1000), 60000),
          );
        }
      }
    } catch {
      if (request === this.request) {
        if (background) {
          this.releaseTimer = setTimeout(() => void this.load({ background: true }), 60000);
        } else {
          this.loadError.set(true);
        }
      }
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  add(): void {
    if (!this.editable() || this.saving() || this.model().links.length >= this.maximum) return;
    this.model.update((model) => ({ links: [...model.links, { title: '', url: '' }] }));
  }
  remove(index: number): void {
    if (!this.editable() || this.saving()) return;
    this.model.update((model) => ({ links: model.links.filter((_, current) => current !== index) }));
  }
  setReleaseAfterEvent(index: number, releaseAfterEvent: boolean): void {
    if (!this.editable() || this.saving()) return;
    this.model.update((model) => ({
      links: model.links.map((link, current) =>
        current === index
          ? { title: link.title, url: link.url, ...(releaseAfterEvent ? { releaseAfterEvent: true } : {}) }
          : link,
      ),
    }));
  }
  discard(): void {
    if (this.saving()) return;
    this.model.set({ links: this.original().map((link) => ({ ...link })) });
    this.error.set('');
  }
  async save(): Promise<void> {
    if (this.saving() || !this.editable() || this.validationError() || !this.changed()) return;
    const request = this.request;
    const links = parseEventMaterials(this.model().links);
    this.saving.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const result = await this.api.saveMaterials(this.eventId(), links, this.revision);
      if (request !== this.request) return;
      this.original.set(result.links);
      this.model.set({ links: result.links.map((link) => ({ ...link })) });
      this.revision = result.updatedAt;
      this.message.set('Materiais salvos. Nenhum aviso foi enviado aos inscritos.');
    } catch (error) {
      if (request === this.request)
        this.error.set(error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.');
    } finally {
      if (request === this.request) this.saving.set(false);
    }
  }
}
