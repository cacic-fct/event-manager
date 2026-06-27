import { Signal, WritableSignal, computed, signal } from '@angular/core';

export const WORKSPACE_LIST_PAGE_SIZE = 50;

export interface WorkspaceListPagination {
  readonly pageIndex: WritableSignal<number>;
  readonly hasNextPage: WritableSignal<boolean>;
  readonly hasPreviousPage: Signal<boolean>;
  readonly label: Signal<string>;
}

export function createWorkspaceListPagination(pageSize = WORKSPACE_LIST_PAGE_SIZE): WorkspaceListPagination {
  const pageIndex = signal(0);
  const hasNextPage = signal(false);

  return {
    pageIndex,
    hasNextPage,
    hasPreviousPage: computed(() => pageIndex() > 0),
    label: computed(() => {
      const firstItem = pageIndex() * pageSize + 1;
      const lastItem = firstItem + pageSize - 1;
      return `${firstItem}-${lastItem}`;
    }),
  };
}

export function pageVariables(pageIndex: number, pageSize = WORKSPACE_LIST_PAGE_SIZE): { skip: number; take: number } {
  return {
    skip: pageIndex * pageSize,
    take: pageSize + 1,
  };
}

export function applyPagedResult<T>(
  items: T[],
  pagination: WorkspaceListPagination,
  pageSize = WORKSPACE_LIST_PAGE_SIZE,
): T[] {
  pagination.hasNextPage.set(items.length > pageSize);
  return items.slice(0, pageSize);
}

export function resetPagination(pagination: WorkspaceListPagination): void {
  pagination.pageIndex.set(0);
  pagination.hasNextPage.set(false);
}
