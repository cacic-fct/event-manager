// Executes the actual route callbacks with a controlled asynchronous response writer.
// This covers promise ownership; it does not replace browser/HTTP streaming tests.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

for (const appName of ['public', 'admin']) {
  const file = `apps/${appName}/src/server.ts`;
  const source = ts.createSourceFile(file, readFileSync(path.join(__dirname, '..', file), 'utf8'), ts.ScriptTarget.Latest, true);
  const handlers = source.statements.flatMap((statement) => {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) return [];
    const call = statement.expression;
    if (!['app.get', 'app.use'].includes(call.expression.getText(source))) return [];
    const handler = call.arguments.at(-1);
    return handler && ts.isArrowFunction(handler) && handler.getText(source).includes('writeResponseToNodeResponse')
      ? [{ name: call.arguments[0].getText(source), code: handler.getText(source) }] : [];
  });
  assert.equal(handlers.length, 2, `${appName} must cover both static index and SSR handlers`);
  for (const { name, code } of handlers) {
    test(`${appName} ${name} delegates a late response-writer rejection once`, async () => {
      let writerStarted;
      const started = new Promise((resolve) => { writerStarted = resolve; });
      let rejectWriter;
      const writer = new Promise((_, reject) => { rejectWriter = reject; });
      const html = new Response('<html></html>', { headers: { 'content-type': 'text/html' } });
      const context = {
        module: { exports: {} }, Response,
        readFile: async () => '<html></html>',
        join: path.join, basename: path.basename, browserDistFolder: '/test/browser',
        applyCspToHtmlResponse: async (response) => response,
        publicCspPolicy: {}, adminCspPolicy: {}, addTurnstileSiteKeyMeta: (value) => value,
        isHtmlResponse: () => true, angularApp: { handle: async () => html },
        writeResponseToNodeResponse: () => { writerStarted(); return writer; },
      };
      vm.runInNewContext(ts.transpileModule(`module.exports = ${code}`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
      }).outputText, context);
      const errors = [];
      let delegated;
      const delegation = new Promise((resolve) => { delegated = resolve; });
      const run = context.module.exports({ path: '/index.html' }, {}, (error) => { errors.push(error); delegated(); });
      await started;
      const failure = new Error('stream failed after headers');
      rejectWriter(failure);
      await delegation;
      await run;
      assert.deepEqual(errors, [failure]);
    });
  }
}
