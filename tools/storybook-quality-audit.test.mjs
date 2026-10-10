import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditStorySource, readStoryMetadata } from './storybook-quality-audit.mjs';

const story = `
const meta = {
  title: 'Shared/Content/Example',
  tags: ['autodocs'],
  args: { title: 'Inscrição', name: 'Marina da Silva' },
  argTypes: { title: { control: 'text', description: 'Visible heading' } },
} satisfies Meta<Args>;
export default meta;
export const Playground = { play: async () => {} } satisfies Story;
`;

test('accepts one useful story without cosmetic variants and understands satisfies metadata', () => {
  assert.deepEqual(auditStorySource('libs/example/src/example.stories.ts', story), []);
  assert.equal(readStoryMetadata('example.stories.ts', story).title, 'Shared/Content/Example');
});

test('checks English navigation while allowing Portuguese product fixtures', () => {
  const source = story.replace("export const Playground = {", "export const Playground = { name: 'Padrão',");
  assert.ok(auditStorySource('example.stories.ts', source).some((issue) => issue.includes('story name must use English')));
  assert.ok(auditStorySource('example.stories.ts', story.replace('Visible heading', 'Título visível')).some((issue) => issue.includes('control documentation must use English')));
});

test('rejects inconsistent app categories and missing playgrounds', () => {
  assert.ok(auditStorySource('apps/admin/src/example.stories.ts', story).some((issue) => issue.includes('admin app stories belong under Admin')));
  assert.ok(auditStorySource('example.stories.ts', story.replace('Shared/Content/Example', 'Shared/Misc/Example')).some((issue) => issue.includes('Root/Feature/Surface')));
  assert.ok(auditStorySource('example.stories.ts', story.replace('export const Playground', 'export const Default')).some((issue) => issue.includes('Playground')));
});

test('recognizes an exported playground alias without losing its component metadata', () => {
  const source = story.replace('export const Playground', 'export const Default') + '\nexport const Playground = Default;';
  assert.deepEqual(auditStorySource('example.stories.ts', source), []);
  assert.equal(readStoryMetadata('example.stories.ts', source).stories.length, 2);
});

test('keeps accessibility violations actionable in browser tests', () => {
  const source = story.replace("tags: ['autodocs'],", "tags: ['autodocs'], parameters: { a11y: { test: 'todo' } },");
  assert.ok(auditStorySource('example.stories.ts', source).some((issue) => issue.includes('accessibility violations must fail tests')));
});
