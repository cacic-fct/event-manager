import { faker } from '@faker-js/faker';
import type { ResolvedTransferDocument } from './lib/schema';
import { TRANSFER_FORMAT, TRANSFER_SCHEMA_ID, TRANSFER_VERSION } from './lib/schema-helpers';

/** Shared by schema, API, integration, browser, and Storybook checks. */
export function createTransferTreeFixture(now = new Date()): ResolvedTransferDocument {
  const majorId = faker.string.uuid();
  const groupId = faker.string.uuid();
  const eventId = faker.string.uuid();
  const startDate = new Date(now.getTime() + 7 * 86400000).toISOString();
  const endDate = new Date(now.getTime() + 8 * 86400000).toISOString();
  return {
    $schema: TRANSFER_SCHEMA_ID,
    format: TRANSFER_FORMAT,
    version: TRANSFER_VERSION,
    resources: [
      { kind: 'major-event', id: majorId, data: { name: 'Semana da Computação', emoji: '💻', startDate, endDate } },
      { kind: 'group', id: groupId, data: { name: 'Minicursos', emoji: '🧑‍💻', majorEventId: majorId } },
      {
        kind: 'event',
        id: eventId,
        data: {
          name: 'Introdução a TypeScript',
          type: 'MINICURSO',
          startDate,
          endDate,
          majorEventId: majorId,
          eventGroupId: groupId,
        },
      },
    ],
  };
}
