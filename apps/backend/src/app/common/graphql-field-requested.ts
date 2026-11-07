import {
  getDirectiveValues,
  GraphQLIncludeDirective,
  GraphQLSkipDirective,
  Kind,
  type GraphQLResolveInfo,
  type SelectionSetNode,
} from 'graphql';

/** Check schema field names, including selections reached through aliases and fragments. */
export function graphqlFieldRequested(info: GraphQLResolveInfo | undefined, path: readonly string[]): boolean {
  // Direct service/resolver callers retain the complete projection.
  if (!info) return true;

  function includesField(
    selectionSet: SelectionSetNode | undefined,
    remaining: readonly string[],
    visited: Set<string>,
  ): boolean {
    if (remaining.length === 0) return true;
    return (
      selectionSet?.selections.some((selection) => {
        if (
          getDirectiveValues(GraphQLSkipDirective, selection, info?.variableValues)?.['if'] === true ||
          getDirectiveValues(GraphQLIncludeDirective, selection, info?.variableValues)?.['if'] === false
        ) {
          return false;
        }
        if (selection.kind === Kind.FIELD) {
          return (
            selection.name.value === remaining[0] && includesField(selection.selectionSet, remaining.slice(1), visited)
          );
        }
        if (selection.kind === Kind.INLINE_FRAGMENT) {
          return includesField(selection.selectionSet, remaining, visited);
        }
        const name = selection.name.value;
        if (visited.has(name)) return false;
        return includesField(info?.fragments[name]?.selectionSet, remaining, new Set([...visited, name]));
      }) ?? false
    );
  }

  return info.fieldNodes.some((node) => includesField(node.selectionSet, path, new Set()));
}
