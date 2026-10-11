import { readdirSync, readFileSync } from 'node:fs';
import { matchesGlob, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import ts from 'typescript';
import { getLibraryStoryGlobs } from './storybook-library-stories.mjs';

const categories = {
  Public: new Set(['Layout', 'Landing', 'Discovery', 'Registration', 'Attendance', 'Profile', 'Ticketing', 'Sports', 'Notifications', 'Settings', 'Support', 'Developer Tools']),
  Admin: new Set(['Layout', 'Dashboard', 'Event Management', 'Registration', 'Attendance', 'Ticketing', 'People', 'Forms', 'Sports', 'Prize Draws', 'Notifications', 'Access', 'Settings', 'Audit']),
  Shared: new Set(['Brand', 'Content', 'Feedback', 'Forms', 'Registration', 'Media', 'Attendance', 'Notifications', 'Scanning', 'Service Worker', 'Verification', 'Dialogs', 'Sports']),
};

function collectStoryFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectStoryFiles(path);
    return entry.isFile() && entry.name.endsWith('.stories.ts') ? [path] : [];
  });
}

function unwrapExpression(node) {
  while (ts.isSatisfiesExpression(node) || ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) {
    node = node.expression;
  }
  return node;
}

function property(object, name) {
  return object?.properties?.find((node) => ts.isPropertyAssignment(node) && node.name.getText().replaceAll(/['"]/g, '') === name)?.initializer;
}

function isEnglishLabel(text) {
  return !/[À-ÖØ-öø-ÿ]|\b(?:nenhum|nenhuma|carregando|inscrições|presenças|sorteios|padrão|vazio|escuro|claro|somente|permissões|bilhete|exibir|configuração)\b/i.test(text);
}

export function readStoryMetadata(file, source) {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let meta;
  const stories = [];
  const initializers = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.initializer) initializers.set(declaration.name.getText(sourceFile), declaration.initializer);
    }
  }
  function resolveObject(initializer, visited = new Set()) {
    const value = unwrapExpression(initializer);
    if (ts.isObjectLiteralExpression(value)) return value;
    if (!ts.isIdentifier(value) || visited.has(value.text) || !initializers.has(value.text)) return undefined;
    visited.add(value.text);
    return resolveObject(initializers.get(value.text), visited);
  }
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!declaration.initializer) continue;
      const value = resolveObject(declaration.initializer);
      if (!value) continue;
      if (declaration.name.getText(sourceFile) === 'meta') meta = value;
      if (statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        const name = property(value, 'name');
        stories.push({
          exportName: declaration.name.getText(sourceFile),
          name: name && ts.isStringLiteral(name) ? name.text : undefined,
          hasPlay: Boolean(property(value, 'play')),
        });
      }
    }
  }
  const title = property(meta, 'title');
  return { title: title && ts.isStringLiteral(title) ? title.text : undefined, meta, stories, sourceFile };
}

export function auditStorySource(file, source) {
  const failures = [];
  const { title, meta, stories } = readStoryMetadata(file, source);
  const [root, category, ...surface] = title?.split('/') ?? [];
  if (!categories[root]?.has(category) || surface.length < 1 || surface.length > 2) {
    failures.push('use Root/Feature/Surface titles with at most four levels (Public, Admin, or Shared)');
  }
  if (title && !isEnglishLabel(title)) failures.push('sidebar title must use English');
  if (file.startsWith('apps/public/') && root !== 'Public') failures.push('public app stories belong under Public');
  if (file.startsWith('apps/admin/') && root !== 'Admin') failures.push('admin app stories belong under Admin');
  if (stories.length === 0) failures.push('export at least one story');
  if (!stories.some((story) => story.exportName === 'Playground')) failures.push('provide a Playground entry');

  for (const story of stories) {
    if (!isEnglishLabel(story.name ?? story.exportName)) failures.push(`${story.exportName}: story name must use English`);
    if (story.exportName === 'Playground' && story.name && story.name !== 'Playground') {
      failures.push('keep the Playground display name consistent');
    }
  }

  const argTypes = property(meta, 'argTypes');
  if (argTypes && ts.isObjectLiteralExpression(argTypes)) {
    function visitLabel(node) {
      if (ts.isPropertyAssignment(node) && ['name', 'description', 'category', 'subcategory'].includes(node.name.getText().replaceAll(/['"]/g, ''))) {
        const value = node.initializer;
        if ((ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) && !isEnglishLabel(value.text)) {
          failures.push(`control documentation must use English: ${value.text}`);
        }
      }
      if (ts.isPropertyAssignment(node) && node.name.getText() === 'labels' && ts.isObjectLiteralExpression(node.initializer)) {
        for (const label of node.initializer.properties) {
          if (ts.isPropertyAssignment(label) && ts.isStringLiteral(label.initializer) && !isEnglishLabel(label.initializer.text)) {
            failures.push(`control option labels must use English: ${label.initializer.text}`);
          }
        }
      }
      ts.forEachChild(node, visitLabel);
    }
    visitLabel(argTypes);
  }

  const docs = property(property(meta, 'parameters'), 'docs');
  if (docs) {
    function visitDocumentation(node) {
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !isEnglishLabel(node.text)) {
        failures.push(`Storybook documentation must use English: ${node.text}`);
      }
      ts.forEachChild(node, visitDocumentation);
    }
    visitDocumentation(docs);
  }

  if (!/tags\s*:\s*\[[^\]]*['"]autodocs/.test(source)) failures.push('enable Autodocs');
  if (!/\bplay\s*:/.test(source)) failures.push('include a meaningful interaction or render assertion');
  if (!/\bargTypes\s*:/.test(source) && !/controls\s*:\s*\{\s*disable\s*:\s*true/.test(source)) {
    failures.push('define useful controls or explicitly disable them for a static surface');
  }
  if (source.includes('@faker-js/faker') && !/faker\.seed\s*\(/.test(source)) {
    failures.push('seed faker data deterministically');
  }
  if (/handlers\s*:\s*\[/.test(source)) failures.push('use named MSW handler groups so story mocks override preview mocks');
  if (/\ba11y\s*:\s*\{[^}]*\btest\s*:\s*['"](?:todo|off)['"]/.test(source)) {
    failures.push('accessibility violations must fail tests; use the preview default or test: error');
  }
  return failures;
}

function auditRepository() {
  const repositoryRoot = process.cwd();
  const files = ['apps', 'libs'].flatMap((root) => collectStoryFiles(join(repositoryRoot, root))).sort();
  const failures = [];
  const titles = new Map();
  const libraries = {
    public: getLibraryStoryGlobs('public', repositoryRoot),
    admin: getLibraryStoryGlobs('admin', repositoryRoot),
  };
  let storyCount = 0;

  for (const file of files) {
    const path = relative(repositoryRoot, file).replaceAll('\\', '/');
    const source = readFileSync(file, 'utf8');
    const { title, stories } = readStoryMetadata(file, source);
    storyCount += stories.length;
    failures.push(...auditStorySource(path, source).map((issue) => `${path}: ${issue}`));
    if (titles.has(title)) failures.push(`${path}: duplicate title also used by ${titles.get(title)}`);
    titles.set(title, path);

    if (path.startsWith('libs/')) {
      const audiences = Object.entries(libraries).filter(([, globs]) =>
        globs.some((glob) => matchesGlob(file, resolve(repositoryRoot, 'apps/public/.storybook', glob))),
      );
      if (audiences.length !== 1) failures.push(`${path}: library story must belong to exactly one catalog`);
      const root = audiences[0]?.[0] === 'admin' ? 'Admin/' : 'Shared/';
      if (!title?.startsWith(root)) failures.push(`${path}: library story title must start with ${root}`);
    }
  }

  if (process.argv.includes('--semantic-report')) {
    console.log(`Catalog: ${files.length} story files, ${storyCount} examples. Appearance combinations use global controls.`);
  }
  if (failures.length > 0) {
    console.error(`Storybook quality audit failed with ${failures.length} issue(s):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`Storybook quality audit passed for ${files.length} story files (${storyCount} examples).`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) auditRepository();
