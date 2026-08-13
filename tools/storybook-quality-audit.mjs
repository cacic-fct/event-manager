import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const repositoryRoot = process.cwd();
const storyRoots = ['apps', 'libs'];

function collectStoryFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectStoryFiles(path);
    }
    return entry.isFile() && entry.name.endsWith('.stories.ts') ? [path] : [];
  });
}

const files = storyRoots.flatMap((root) => collectStoryFiles(join(repositoryRoot, root))).sort();
const failures = [];

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const storyCount = source.match(/export const /g)?.length ?? 0;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let metaTitle;

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(sourceFile) === 'meta' &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      const titleProperty = node.initializer.properties.find(
        (property) => ts.isPropertyAssignment(property) && property.name.getText(sourceFile) === 'title',
      );
      if (
        titleProperty &&
        ts.isPropertyAssignment(titleProperty) &&
        ts.isStringLiteral(titleProperty.initializer)
      ) {
        metaTitle = titleProperty.initializer.text;
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (
    !metaTitle?.startsWith('CACiC Eventos/') ||
    metaTitle.startsWith('CACiC Eventos/Admin/') ||
    metaTitle.startsWith('CACiC Eventos/Public/')
  ) {
    failures.push(`${relative(repositoryRoot, file)}: missing feature-first CACiC Eventos taxonomy`);
  }

  const checks = [
    [/tags\s*:\s*\[[^\]]*['"]autodocs/, 'Autodocs tag'],
    [/export const Playground\b/, 'Playground story'],
    [/\bplay\s*:/, 'interaction test'],
    [/\b(?:argTypes|globals)\s*:/, 'controls or environment globals'],
    [/theme\s*:\s*['"]dark/, 'dark-theme variation'],
    [/motion\s*:\s*['"]reduced/, 'reduced-motion variation'],
  ];

  for (const [pattern, label] of checks) {
    if (!pattern.test(source)) {
      failures.push(`${relative(repositoryRoot, file)}: missing ${label}`);
    }
  }

  if (storyCount < 3) {
    failures.push(`${relative(repositoryRoot, file)}: expected at least three meaningful variations`);
  }

  if (source.includes('@faker-js/faker') && !/faker\.seed\s*\(/.test(source)) {
    failures.push(`${relative(repositoryRoot, file)}: faker data must use a deterministic seed`);
  }
}

if (failures.length > 0) {
  console.error(`Storybook quality audit failed with ${failures.length} issue(s):`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Storybook quality audit passed for ${files.length} story files.`);
}
