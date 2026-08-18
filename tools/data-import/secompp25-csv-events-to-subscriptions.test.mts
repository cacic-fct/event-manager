import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEventRows,
  computeBaseKey,
  extractEventName,
  fetchEvents,
  findTokenMatches,
  isEventColumn,
  normalizeEventName,
  resolveEventNames,
  sequenceMatcherRatio,
} from './secompp25-csv-events-to-subscriptions.mts';

test('normalizes event names, schedule suffixes, and part markers', () => {
  assert.equal(normalizeEventName('“Introdução” (20 vagas)'), '"introdução"');
  assert.deepEqual(computeBaseKey('A Oficina - Parte 2 (sexta - tarde)'), ['oficina', 2]);
  assert.equal(extractEventName('Curso de dados (15 vagas)'), 'Curso de dados');
  assert.equal(extractEventName('https://example.com'), null);
  assert.equal(extractEventName('Não quero me inscrever nesse horário'), null);
});

test('detects only the expected Google Forms event columns', () => {
  assert.equal(isEventColumn('Segunda - Manhã'), true);
  assert.equal(isEventColumn('Palestra sobre IA - período noturno'), true);
  assert.equal(isEventColumn('Nome completo'), false);
});

test('resolves exact, part-aware, token, special, and fuzzy event matches', () => {
  const databaseRows = [
    { id: 'exact', name: 'Mesa Redonda' },
    { id: 'part-1', name: 'A Oficina - Parte 1' },
    { id: 'part-2', name: 'A Oficina - Parte 2' },
    { id: 'latex', name: 'LaTeX para iniciantes' },
    { id: 'poke', name: 'PokeAPI em Python' },
    { id: 'fuzzy', name: 'Como se destacar no mercado de trabalho' },
  ];
  const resolution = resolveEventNames(
    ['Mesa Redonda', 'Oficina (parte 2)', 'LaTex', 'Poke API', 'Como se destacar no mercado de trablho'],
    databaseRows,
  );
  assert.equal(resolution.eventIdByInputName.get('Mesa Redonda'), 'exact');
  assert.equal(resolution.eventIdByInputName.get('Oficina (parte 2)'), 'part-2');
  assert.equal(resolution.eventIdByInputName.get('LaTex'), 'latex');
  assert.equal(resolution.eventIdByInputName.get('Poke API'), 'poke');
  assert.equal(resolution.eventIdByInputName.get('Como se destacar no mercado de trablho'), 'fuzzy');
});

test('reports ambiguous base matches and preserves token matching order', () => {
  const rows = buildEventRows([
    { id: 'one', name: 'A Curso de Dados - Parte 1' },
    { id: 'two', name: 'A Curso de Dados - Parte 2' },
  ]);
  assert.equal(findTokenMatches('curso dados', null, rows).length, 2);
  const resolution = resolveEventNames(['Curso de Dados'], [
    { id: 'one', name: 'A Curso de Dados - Parte 1' },
    { id: 'two', name: 'A Curso de Dados - Parte 2' },
  ]);
  assert.equal(resolution.ambiguousEventNames.length, 1);
  assert.equal(resolution.missingEventNames.length, 0);
});

test('uses a SequenceMatcher-compatible ratio and parameterized PostgreSQL query', async () => {
  assert.equal(sequenceMatcherRatio('same', 'same'), 1);
  assert.ok(sequenceMatcherRatio('same', 'different') < 1);
  let query: { text: string; values: number[] } | undefined;
  const rows = await fetchEvents(
    {
      async query(value) {
        query = value;
        return { rows: [{ id: 'event-1', name: 'Event' }, { id: 2, name: 'ignored' }] };
      },
    },
    2025,
  );
  assert.deepEqual(rows, [{ id: 'event-1', name: 'Event' }]);
  assert.ok(query);
  assert.equal(query.values[0], 2025);
  assert.match(query.text, /"deletedAt" IS NULL/);
});
