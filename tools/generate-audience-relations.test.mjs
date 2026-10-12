import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const generatorPath = join(repositoryRoot, 'tools/generate-audience-relations.mjs');

test('accepts formatted relation metadata while rejecting stale relation data', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'audience-relations-'));
  const fixtureGeneratorPath = join(fixtureRoot, 'tools/generate-audience-relations.mjs');
  const fixtureSchemaDirectory = join(fixtureRoot, 'apps/backend/prisma/schema');
  const fixtureOutputPath = join(fixtureRoot, 'apps/backend/src/app/audiences/audience-relations.generated.ts');

  try {
    mkdirSync(fixtureSchemaDirectory, { recursive: true });
    mkdirSync(dirname(fixtureOutputPath), { recursive: true });
    mkdirSync(dirname(fixtureGeneratorPath), { recursive: true });
    writeFileSync(join(fixtureRoot, 'package.json'), JSON.stringify({ type: 'module' }));
    copyFileSync(generatorPath, fixtureGeneratorPath);
    writeFileSync(
      join(fixtureSchemaDirectory, 'relations.prisma'),
      `model Owner {
  id      String @id
  eventId String?
  event   Event? @relation(fields: [eventId], references: [id])
}

model Event {
  id           String  @id
  participants Owner[]
}
`,
    );

    const generate = spawnSync(process.execPath, [fixtureGeneratorPath], { encoding: 'utf8' });
    assert.equal(generate.status, 0, generate.stderr);

    const generated = readFileSync(fixtureOutputPath, 'utf8');
    assert.match(
      generated,
      /"name": "event"[\s\S]*?"isList": false,[\s\S]*?"isRequired": false,[\s\S]*?"ownsRelation": true/,
    );
    assert.match(
      generated,
      /"name": "participants"[\s\S]*?"isList": true,[\s\S]*?"isRequired": true,[\s\S]*?"ownsRelation": false/,
    );

    const check = spawnSync(process.execPath, [fixtureGeneratorPath, '--check'], { encoding: 'utf8' });
    assert.equal(check.status, 0, check.stderr);

    writeFileSync(fixtureOutputPath, generated.replace('"isList": false', '"isList": true'));
    const staleCheck = spawnSync(process.execPath, [fixtureGeneratorPath, '--check'], { encoding: 'utf8' });
    assert.notEqual(staleCheck.status, 0);
    assert.match(staleCheck.stderr, /Audience relation metadata is stale/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
