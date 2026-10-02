import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { GraphQLEnumType, GraphQLObjectType, parse, printSchema, validate } from 'graphql';
import { EventContextResolver } from './event-context.resolver';

describe('admin event context GraphQL contract', () => {
  it('builds nullable metadata and validates the actual admin query with optional scope and cursor arguments', async () => {
    const module = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule] }).compile();
    try {
      const schema = await module.get(GraphQLSchemaFactory).create([EventContextResolver]);
      const printed = printSchema(schema);
      expect(printed).toContain('adminEventContextPage(parentKind: AdminEventContextKind, parentId: String, childKind: AdminEventContextKind, query: String, cursor: String, take: Int, startDateFrom: DateTime, startDateUntil: DateTime, isInGroup: Boolean, isInMajorEvent: Boolean): AdminEventContextPage!');
      const kind = schema.getType('AdminEventContextKind') as GraphQLEnumType;
      expect(kind.getValues().map((value) => value.name)).toEqual(['EVENT', 'EVENT_GROUP', 'MAJOR_EVENT']);
      const page = (schema.getType('AdminEventContextPage') as GraphQLObjectType).getFields();
      expect(String(page['nodes'].type)).toBe('[AdminEventContextNode!]!');
      expect(String(page['nextCursor'].type)).toBe('String');
      const fields = (schema.getType('AdminEventContextNode') as GraphQLObjectType).getFields();
      expect(String(fields['startDate'].type)).toBe('DateTime');
      expect(String(fields['endDate'].type)).toBe('DateTime');
      expect(String(fields['eventType'].type)).toBe('String');
      expect(String(fields['locationDescription'].type)).toBe('String');
      expect(String(fields['publicationState'].type)).toBe('String');
      expect(String(fields['ancestors'].type)).toBe('[AdminEventContextAncestor!]!');
      expect(String(fields['hasChildren'].type)).toBe('Boolean!');
      const clientSource = readFileSync(resolve(__dirname, '../../../../admin/src/app/graphql/admin-event-context-api.service.ts'), 'utf8');
      const query = clientSource.match(/`(query AdminEventContextPage[\s\S]+?)`/)?.[1];
      expect(query).toBeDefined();
      expect(validate(schema, parse(query ?? ''))).toEqual([]);
      expect(validate(schema, parse('{ adminEventContextPage { nodes { id kind } nextCursor } }'))).toEqual([]);
    } finally {
      await module.close();
    }
  });
});
