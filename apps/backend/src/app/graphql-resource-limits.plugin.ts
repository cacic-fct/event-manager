import type {
  ApolloServerPlugin,
  GraphQLRequestContext,
  GraphQLRequestContextDidResolveOperation,
} from '@apollo/server';
import { GraphQLError, Kind, type DocumentNode, type FragmentDefinitionNode, type SelectionNode } from 'graphql';
import type { Request, Response } from 'express';

const MAX_QUERY_BYTES = 100 * 1024;
const MAX_QUERY_DEPTH = 12;
const MAX_QUERY_ALIASES = 50;
const MAX_QUERY_OPERATIONS = 1;
const MAX_QUERY_COMPLEXITY = 2_000;

type GraphqlResourceLimitContext = {
  req?: Request;
  res?: Response;
};

export function createGraphqlResourceLimitsPlugin(): ApolloServerPlugin<GraphqlResourceLimitContext> {
  return {
    async requestDidStart(requestContext: GraphQLRequestContext<GraphqlResourceLimitContext>) {
      assertQuerySize(requestContext.request.query);

      return {
        async didResolveOperation(
          operationContext: GraphQLRequestContextDidResolveOperation<GraphqlResourceLimitContext>,
        ): Promise<void> {
          assertDocumentLimits(operationContext.document);
        },
      };
    },
  };
}

function assertQuerySize(query: string | undefined): void {
  if (typeof query === 'string' && Buffer.byteLength(query, 'utf8') > MAX_QUERY_BYTES) {
    throw badGraphqlRequest('GraphQL query is too large.');
  }
}

function assertDocumentLimits(document: DocumentNode): void {
  const operations = document.definitions.filter((definition) => definition.kind === Kind.OPERATION_DEFINITION);
  if (operations.length > MAX_QUERY_OPERATIONS) {
    throw badGraphqlRequest('Only one GraphQL operation may be sent per request.');
  }

  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      fragments.set(definition.name.value, definition);
    }
  }

  let aliases = 0;
  let complexity = 0;
  let depth = 0;
  for (const operation of operations) {
    const result = measureSelections(operation.selectionSet.selections, fragments, 0, new Set());
    aliases += result.aliases;
    complexity += result.complexity;
    depth = Math.max(depth, result.depth);
  }

  if (aliases > MAX_QUERY_ALIASES) {
    throw badGraphqlRequest('GraphQL query contains too many aliases.');
  }
  if (depth > MAX_QUERY_DEPTH) {
    throw badGraphqlRequest('GraphQL query is too deeply nested.');
  }
  if (complexity > MAX_QUERY_COMPLEXITY) {
    throw badGraphqlRequest('GraphQL query is too complex.');
  }
}

function measureSelections(
  selections: readonly SelectionNode[],
  fragments: ReadonlyMap<string, FragmentDefinitionNode>,
  parentDepth: number,
  fragmentStack: ReadonlySet<string>,
): { aliases: number; complexity: number; depth: number } {
  let aliases = 0;
  let complexity = 0;
  let depth = parentDepth;

  for (const selection of selections) {
    if (selection.kind === Kind.FIELD) {
      const fieldDepth = parentDepth + 1;
      aliases += selection.alias ? 1 : 0;
      complexity += fieldDepth;
      depth = Math.max(depth, fieldDepth);
      if (selection.selectionSet) {
        const nested = measureSelections(selection.selectionSet.selections, fragments, fieldDepth, fragmentStack);
        aliases += nested.aliases;
        complexity += nested.complexity;
        depth = Math.max(depth, nested.depth);
      }
      continue;
    }

    if (selection.kind === Kind.INLINE_FRAGMENT) {
      const nested = measureSelections(selection.selectionSet.selections, fragments, parentDepth, fragmentStack);
      aliases += nested.aliases;
      complexity += nested.complexity;
      depth = Math.max(depth, nested.depth);
      continue;
    }

    const fragmentName = selection.name.value;
    if (fragmentStack.has(fragmentName)) {
      continue;
    }
    const fragment = fragments.get(fragmentName);
    if (!fragment) {
      continue;
    }
    const nextStack = new Set(fragmentStack);
    nextStack.add(fragmentName);
    const nested = measureSelections(fragment.selectionSet.selections, fragments, parentDepth, nextStack);
    aliases += nested.aliases;
    complexity += nested.complexity;
    depth = Math.max(depth, nested.depth);
  }

  return { aliases, complexity, depth };
}

function badGraphqlRequest(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: {
      code: 'BAD_USER_INPUT',
      http: { status: 400 },
    },
  });
}
