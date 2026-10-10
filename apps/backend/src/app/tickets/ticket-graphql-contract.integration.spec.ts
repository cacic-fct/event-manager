import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { parse, validate } from 'graphql';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { TicketsResolver } from './tickets.resolver';
import { TicketPurchasesResolver } from '../ticket-purchases/ticket-purchases.resolver';
import { MajorEventReceiptsResolver } from '../major-event-receipts/major-event-receipts.resolver';

/** Reads client operation templates and shared fragments. */
function clientOperations(path: string): string[] {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const constants = new Map<string, ts.Expression>();
  const templates: ts.Expression[] = [];
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) constants.set(node.name.text, node.initializer);
    if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) templates.push(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  function text(node: ts.Expression, operationName: string): string | null {
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isIdentifier(node)) {
      if (node.text === 'operationName') return operationName;
      const value = constants.get(node.text);
      return value ? text(value, operationName) : null;
    }
    if (ts.isTemplateExpression(node)) {
      let result = node.head.text;
      for (const span of node.templateSpans) {
        const value = text(span.expression, operationName);
        if (value === null) return null;
        result += value + span.literal.text;
      }
      return result;
    }
    return null;
  }
  return [...new Set(templates.flatMap((template) =>
    ['cancelTicketTransfer', 'acceptTicketTransfer', 'ignoreTicketTransfer'].flatMap((operationName) => {
      const value = text(template, operationName);
      return value && /^\s*(query|mutation)\b/u.test(value) ? [value] : [];
    }),
  ))];
}

describe('ticket GraphQL frontend/backend contract', () => {
  it('checks ticket client operations against the generated schema', async () => {
    const module = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule] }).compile();
    try {
      const schema = await module.get(GraphQLSchemaFactory).create([TicketsResolver, TicketPurchasesResolver, MajorEventReceiptsResolver]);
      const root = resolve(__dirname, '../../../../..');
      const files = [
        'apps/admin/src/app/graphql/ticket-admin-api.service.ts',
        'apps/admin/src/app/graphql/receipt-validation-api.service.ts',
        'apps/public/src/app/profile/ticketing/ticketing-api.service.ts',
        'apps/public/src/app/major-events/payment/ticket-purchase-api.service.ts',
      ];
      const documents = files.flatMap((file) => clientOperations(resolve(root, file)).map((document) => ({ file, document })));
      expect(documents.length).toBeGreaterThanOrEqual(18);
      const errors = documents.flatMap(({ file, document }) => validate(schema, parse(document)).map((error) => `${file}: ${error.message}`));
      expect(errors).toEqual([]);
    } finally {
      await module.close();
    }
  });
});
