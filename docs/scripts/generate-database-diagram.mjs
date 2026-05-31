import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsPage = resolve(docsRoot, 'docs-backend', 'Banco de dados', 'Esquema.md');
const schemaRelativePath = 'apps/backend/prisma/schema';

const appRootCandidates = [
  process.env.EVENT_MANAGER_ROOT,
  resolve(docsRoot, '..', '..', 'event-manager'),
  resolve(docsRoot, '..'),
].filter(Boolean);

const appRoot = appRootCandidates.find((candidate) =>
  existsSync(resolve(candidate, schemaRelativePath, 'base.prisma')),
);

if (!appRoot) {
  throw new Error(
    `Could not find ${schemaRelativePath}/base.prisma. Set EVENT_MANAGER_ROOT to the repository root before building docs.`,
  );
}

const schemaDirectory = resolve(appRoot, schemaRelativePath);
const generatedDiagram = resolve(schemaDirectory, 'database-erd.md');

rmSync(generatedDiagram, { force: true });

execFileSync('bunx', ['prisma', 'generate', '--schema', schemaDirectory], {
  cwd: appRoot,
  stdio: 'inherit',
});

const generatedMarkdown = readFileSync(generatedDiagram, 'utf8');
const generatedMatch = generatedMarkdown.match(/`{3,4}mermaid\s*([\s\S]*?)\s*`{3,4}/);

if (!generatedMatch) {
  throw new Error(`Generated ERD file does not contain a Mermaid diagram: ${generatedDiagram}`);
}

const diagram = generatedMatch[1].trim();

if (!diagram.startsWith('erDiagram')) {
  throw new Error('Generated Mermaid diagram is not an erDiagram.');
}

const pageMarkdown = readFileSync(docsPage, 'utf8');
const docsMermaidBlock = /```mermaid\s*[\s\S]*?\s*```/;

if (!docsMermaidBlock.test(pageMarkdown)) {
  throw new Error(`Could not find a Mermaid code block in ${docsPage}`);
}

const updatedMarkdown = pageMarkdown.replace(
  docsMermaidBlock,
  `\`\`\`mermaid\n\n${diagram}\n\n\`\`\``,
);

writeFileSync(docsPage, updatedMarkdown);
