export interface EventMaterial {
  title: string;
  url: string;
  releaseAfterEvent?: boolean;
}

export interface EventMaterials {
  links: EventMaterial[];
  updatedAt: string | null;
  nextReleaseAt?: string | null;
}

export interface EventPreparation {
  lecturerInformation: string | null;
  collectorInformation: string | null;
  updatedAt: string | null;
}

export type EventNotificationAudience = 'LECTURERS' | 'SUBSCRIBERS';

export const MAX_EVENT_NOTIFICATION_LENGTH = 2000;
export const MAX_EVENT_MATERIAL_TITLE_LENGTH = 200;
export const MAX_EVENT_MATERIAL_URL_LENGTH = 2048;
export const MAX_EVENT_MATERIALS = 20;
export const MAX_EVENT_INFORMATION_LENGTH = 10000;

/** Shared by the editors and API. No fetch or upload is performed for external links. */
export function parseEventMaterials(value: unknown): EventMaterial[] {
  if (!Array.isArray(value) || value.length > MAX_EVENT_MATERIALS) {
    throw new Error(`Adicione até ${MAX_EVENT_MATERIALS} materiais por evento.`);
  }
  const urls = new Set<string>();
  return value.map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || !('title' in entry) || !('url' in entry)) {
      throw new Error('Informe o título e o link de cada material.');
    }
    const title = typeof entry.title === 'string' ? entry.title.trim() : '';
    const url = typeof entry.url === 'string' ? entry.url.trim() : '';
    const releaseAfterEvent = 'releaseAfterEvent' in entry ? entry.releaseAfterEvent : false;
    if (releaseAfterEvent != null && typeof releaseAfterEvent !== 'boolean') {
      throw new Error('Escolha se o material deve ser liberado após o término do evento.');
    }
    if (!title || title.length > MAX_EVENT_MATERIAL_TITLE_LENGTH || url.length > MAX_EVENT_MATERIAL_URL_LENGTH) {
      throw new Error('Use um título de até 200 caracteres e um link de até 2.048 caracteres.');
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Informe um link completo, começando com https://.');
    }
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error('Use links HTTPS sem credenciais.');
    }
    const canonical = parsed.href;
    if (canonical.length > MAX_EVENT_MATERIAL_URL_LENGTH) {
      throw new Error('Use um título de até 200 caracteres e um link de até 2.048 caracteres.');
    }
    if (urls.has(canonical)) throw new Error('Cada link deve aparecer apenas uma vez.');
    urls.add(canonical);
    return { title, url: canonical, ...(releaseAfterEvent ? { releaseAfterEvent: true } : {}) };
  });
}
