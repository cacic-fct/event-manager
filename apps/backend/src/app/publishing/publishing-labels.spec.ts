import { PublicationState } from '@cacic-fct/shared-data-types';
import { PublicationBulkOperation } from './publishing.models';
import {
  describeBulkOperation,
  describeStateChange,
  publicationStateLabel,
  publicationSummary,
} from './publishing-labels';
import { TargetSync } from './publishing.types';

describe('publishing labels', () => {
  it('summarizes publication states with stable operator-facing text', () => {
    expect(publicationSummary(PublicationState.DRAFT)).toBe('Conteúdo movido para rascunho.');
    expect(publicationSummary(PublicationState.SCHEDULED)).toBe('Publicação agendada.');
    expect(publicationSummary(PublicationState.PUBLISHED)).toBe('Conteúdo publicado.');
    expect(publicationSummary(PublicationState.UNPUBLISHED)).toBe('Conteúdo despublicado.');
  });

  it('describes state changes with singular and plural affected counts', () => {
    expect(describeStateChange(PublicationState.PUBLISHED, sync(['event-1'], []))).toBe(
      'Conteúdo publicado. 1 item afetado.',
    );
    expect(describeStateChange(PublicationState.UNPUBLISHED, sync(['event-1'], ['major-event-1']))).toBe(
      'Conteúdo despublicado. 2 itens afetados.',
    );
  });

  it('describes bulk operations with operation-specific labels', () => {
    expect(describeBulkOperation(PublicationBulkOperation.PUBLISH_MISSING_CHILDREN, sync(['event-1'], []))).toBe(
      'Item vinculado pendente publicado. 1 item afetado.',
    );
    expect(
      describeBulkOperation(PublicationBulkOperation.PUBLISH_MISSING_CHILDREN, sync(['event-1', 'event-2'], [])),
    ).toBe('Itens vinculados pendentes publicados. 2 itens afetados.');
    expect(describeBulkOperation(PublicationBulkOperation.SCHEDULE_BUNDLE, sync([], ['major-event-1']))).toBe(
      'Conjunto agendado. 1 item afetado.',
    );
    expect(describeBulkOperation(PublicationBulkOperation.UNPUBLISH_BUNDLE, sync(['event-1'], ['major-event-1']))).toBe(
      'Conjunto despublicado. 2 itens afetados.',
    );
  });

  it('labels publication states, including scheduled timestamps in Sao Paulo time', () => {
    expect(publicationStateLabel(PublicationState.DRAFT)).toBe('Rascunho');
    expect(publicationStateLabel(PublicationState.SCHEDULED)).toBe('Agendado');
    expect(publicationStateLabel(PublicationState.PUBLISHED)).toBe('Publicado');
    expect(publicationStateLabel(PublicationState.UNPUBLISHED)).toBe('Despublicado');
    expect(publicationStateLabel(PublicationState.SCHEDULED, new Date('2026-07-07T15:30:00.000Z'))).toBe(
      'Agendado para 07/07/2026, 12:30:00',
    );
  });

  function sync(eventIds: string[], majorEventIds: string[]): TargetSync {
    return {
      eventIds,
      majorEventIds,
    };
  }
});
