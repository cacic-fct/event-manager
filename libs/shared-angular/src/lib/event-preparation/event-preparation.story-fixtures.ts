import type { EventMaterial, EventMaterials, EventPreparation } from '@cacic-fct/shared-event-preparation';

export const storyLecturerInformation =
  '**Sua sala é o Laboratório 3.**\n\nChegue 15 minutos antes. Projetor e cabo HDMI estarão disponíveis.\n\nContato da organização: organizacao@example.org.';
export const storyCollectorInformation =
  '**Antes de começar**\n\n- Confira se o evento selecionado está correto.\n- Peça que cada pessoa apresente seu código de participação.\n- Em caso de dúvida, procure a organização na entrada.';
export const storyMaterialLinks: EventMaterial[] = [
  { title: 'Slides e referências da apresentação', url: 'https://example.org/slides' },
  { title: 'Exercícios para praticar depois do evento', url: 'https://example.org/exercicios' },
];

/** Synthetic data for isolated UI previews; never dispatches notifications. */
export function createEventPreparationStoryApi() {
  const materials = new Map<string, EventMaterials>();
  const preparation = new Map<string, EventPreparation>();
  return {
    getMaterials: async (eventId: string): Promise<EventMaterials> =>
      materials.get(eventId) ?? { links: storyMaterialLinks.map((link) => ({ ...link })), updatedAt: null },
    saveMaterials: async (eventId: string, links: EventMaterial[]): Promise<EventMaterials> => {
      const result = { links, updatedAt: new Date().toISOString() };
      materials.set(eventId, result);
      return result;
    },
    getPreparation: async (eventId: string): Promise<EventPreparation> =>
      preparation.get(eventId) ?? {
        lecturerInformation: storyLecturerInformation,
        collectorInformation: storyCollectorInformation,
        updatedAt: null,
      },
    savePreparation: async (eventId: string, value: EventPreparation): Promise<EventPreparation> => {
      const result = { ...value, updatedAt: new Date().toISOString() };
      preparation.set(eventId, result);
      return result;
    },
    getCollectorInformation: async () => storyCollectorInformation,
    notifyParticipants: async () => true,
  };
}
