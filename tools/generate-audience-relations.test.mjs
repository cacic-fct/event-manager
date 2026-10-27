import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const prismaCliPath = join(repositoryRoot, 'node_modules/prisma/build/cli.js');
const schemaDirectory = join(repositoryRoot, 'apps/backend/prisma/schema');
const metadataPath = join(repositoryRoot, 'apps/backend/src/app/audiences/audience-relations.generated.ts');

async function withGeneratedMetadata(prepareSchema, verify) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'audience-relations-'));
  const fixtureSchemaDirectory = join(fixtureRoot, 'schema');
  const fixtureOutputPath = join(fixtureRoot, 'audience-relations.generated.ts');

  try {
    mkdirSync(fixtureSchemaDirectory);
    writeFileSync(join(fixtureRoot, 'package.json'), JSON.stringify({ type: 'module' }));
    prepareSchema(fixtureSchemaDirectory);
    execFileSync(
      process.execPath,
      [prismaCliPath, 'generate', '--schema', fixtureSchemaDirectory, '--generator', 'audienceRelations'],
      { cwd: repositoryRoot, encoding: 'utf8', stdio: 'pipe' },
    );
    const { AUDIENCE_RELATIONS } = await import(pathToFileURL(fixtureOutputPath).href);
    await verify(AUDIENCE_RELATIONS);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

test('prisma generate keeps checked-in audience metadata synchronized with the schema', async () => {
  await withGeneratedMetadata(
    (fixtureSchemaDirectory) => {
      cpSync(schemaDirectory, fixtureSchemaDirectory, { recursive: true });
      const basePath = join(fixtureSchemaDirectory, 'base.prisma');
      writeFileSync(
        basePath,
        readFileSync(basePath, 'utf8').replace(
          '../../src/app/audiences/audience-relations.generated.ts',
          '../audience-relations.generated.ts',
        ),
      );
    },
    async (generated) => {
      const { AUDIENCE_RELATIONS } = await import(pathToFileURL(metadataPath).href);
      assert.deepEqual(
        AUDIENCE_RELATIONS,
        generated,
        'Audience relation metadata is stale. Run bunx prisma generate --schema apps/backend/prisma/schema.',
      );
    },
  );
});

test('prisma generate handles optional and required owners and implicit many-to-many lists', async () => {
  await withGeneratedMetadata(
    (fixtureSchemaDirectory) => {
      writeFileSync(
        join(fixtureSchemaDirectory, 'base.prisma'),
        `generator audienceRelations {
  provider = "node ./tools/generate-audience-relations.mjs"
  output   = "../audience-relations.generated.ts"
}

datasource db {
  provider = "postgresql"
}

model Owner {
  id      String @id
  eventId String?
  event   Event? @relation(fields: [eventId], references: [id])
}

model RequiredOwner {
  id      String @id
  eventId String
  event   Event @relation(fields: [eventId], references: [id])
}

model Event {
  id             String @id
  participants   Owner[]
  requiredOwners RequiredOwner[]
  tags           Tag[]
}

model Tag {
  id     String @id
  events Event[]
}
`,
      );
    },
    (generated) => {
      assert.deepEqual(generated.Owner, [
        { name: 'event', type: 'Event', isList: false, isRequired: false, ownsRelation: true },
      ]);
      assert.deepEqual(generated.RequiredOwner, [
        { name: 'event', type: 'Event', isList: false, isRequired: true, ownsRelation: true },
      ]);
      assert.deepEqual(generated.Event, [
        { name: 'participants', type: 'Owner', isList: true, isRequired: true, ownsRelation: false },
        { name: 'requiredOwners', type: 'RequiredOwner', isList: true, isRequired: true, ownsRelation: false },
        { name: 'tags', type: 'Tag', isList: true, isRequired: true, ownsRelation: false },
      ]);
      assert.deepEqual(generated.Tag, [
        { name: 'events', type: 'Event', isList: true, isRequired: true, ownsRelation: false },
      ]);
    },
  );
});
