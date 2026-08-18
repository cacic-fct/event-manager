import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';

const OPERATION_DECORATORS = new Set([
  'Delete',
  'Get',
  'Mutation',
  'Patch',
  'Post',
  'Put',
  'Query',
  'ResolveField',
  'Sse',
]);

describe('backend operation test coverage', () => {
  const sourceFiles = walk(__dirname);
  it('references every decorated GraphQL and HTTP operation from a colocated backend test', () => {
    const operations = sourceFiles.flatMap(readDecoratedOperations);
    const uncovered = operations.filter(
      (operation) => !colocatedSpecs(sourceFiles, operation.file).some((contents) => contents.includes(operation.methodName)),
    );

    expect(operations.length).toBeGreaterThan(300);
    expect(uncovered).toEqual([]);
  });

  it('keeps every queue processor and scheduler next to a focused test', () => {
    const uncovered = sourceFiles
      .filter((file) => /\.(processor|scheduler)\.ts$/.test(file) && !file.endsWith('.spec.ts'))
      .filter((file) => !sourceFiles.includes(file.replace(/\.ts$/, '.spec.ts')))
      .map(relativeToApp);

    expect(uncovered).toEqual([]);
  });

  it.each([
    ['public', resolve(__dirname, '../../../public/src/app'), 70],
    ['admin', resolve(__dirname, '../../../admin/src/app'), 150],
  ])('references every public method in %s API services from a test', (_application, applicationRoot, minimum) => {
    const files = walk(applicationRoot);
    const operations = files
      .filter((file) => /api\.service\.ts$/.test(file) && !file.endsWith('.spec.ts'))
      .flatMap(readPublicMethods);
    const uncovered = operations.filter(
      (operation) => !colocatedSpecs(files, operation.file).some((contents) => contents.includes(operation.methodName)),
    );

    expect(operations.length).toBeGreaterThan(minimum);
    expect(uncovered).toEqual([]);
  });
});

type DecoratedOperation = {
  file: string;
  methodName: string;
};

function readDecoratedOperations(file: string): DecoratedOperation[] {
  if (!/(resolver|controller)\.ts$/.test(file) || file.endsWith('.spec.ts')) {
    return [];
  }

  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const operations: DecoratedOperation[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      const decorators = ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
      if (decorators.some(isOperationDecorator)) {
        operations.push({ file, methodName: node.name.text });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return operations;
}

function isOperationDecorator(decorator: ts.Decorator): boolean {
  const expression = decorator.expression;
  const callee = ts.isCallExpression(expression) ? expression.expression : expression;
  return ts.isIdentifier(callee) && OPERATION_DECORATORS.has(callee.text);
}

function readPublicMethods(file: string): DecoratedOperation[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const methods: DecoratedOperation[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isMethodDeclaration(node) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      !node.modifiers?.some(
        (modifier) =>
          modifier.kind === ts.SyntaxKind.PrivateKeyword || modifier.kind === ts.SyntaxKind.ProtectedKeyword,
      )
    ) {
      methods.push({ file, methodName: node.name.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return methods;
}

function colocatedSpecs(files: string[], operationFile: string): string[] {
  return files
    .filter((file) => file.endsWith('.spec.ts') && dirname(file) === dirname(operationFile))
    .map((file) => readFileSync(file, 'utf8'));
}

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function relativeToApp(file: string): string {
  return file.slice(__dirname.length + 1);
}
