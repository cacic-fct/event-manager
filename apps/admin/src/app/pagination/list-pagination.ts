import { Signal, WritableSignal, computed, signal } from '@angular/core';

export const WORKSPACE_LIST_PAGE_SIZE = 50;
const resultRevisions = new WeakMap<WorkspaceListPagination, WritableSignal<number>>();

export interface WorkspaceListPagination {
  readonly pageIndex: WritableSignal<number>;
  readonly itemCount?: WritableSignal<number>;
  readonly hasNextPage: WritableSignal<boolean>;
  readonly hasPreviousPage: Signal<boolean>;
  readonly label: Signal<string>;
}

export function createWorkspaceListPagination(pageSize = WORKSPACE_LIST_PAGE_SIZE): WorkspaceListPagination {
  const pageIndex = signal(0);
  const hasNextPage = signal(false);
  const itemCount = signal(0);
  const pagination: WorkspaceListPagination = {
    pageIndex,
    itemCount,
    hasNextPage,
    hasPreviousPage: computed(() => pageIndex() > 0),
    label: computed(() => {
      if (itemCount() === 0) return '0';
      const firstItem = pageIndex() * pageSize + 1;
      const lastItem = firstItem + itemCount() - 1;
      return `${firstItem}-${lastItem}`;
    }),
  };
  resultRevisions.set(pagination, signal(0));
  return pagination;
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
  pagination.itemCount?.set(Math.min(items.length, pageSize));
  resultRevision(pagination).update((revision) => revision + 1);
  return items.slice(0, pageSize);
}

export function resetPagination(pagination: WorkspaceListPagination): void {
  pagination.pageIndex.set(0);
  pagination.itemCount?.set(0);
  pagination.hasNextPage.set(false);
}

export async function loadPreviousPage(
  pagination: WorkspaceListPagination,
  loadPage: () => Promise<void>,
): Promise<void> {
  await loadAdjacentPage(pagination, Math.max(0, pagination.pageIndex() - 1), loadPage);
}

export async function loadNextPage(pagination: WorkspaceListPagination, loadPage: () => Promise<void>): Promise<void> {
  if (!pagination.hasNextPage()) {
    return;
  }

  await loadAdjacentPage(pagination, pagination.pageIndex() + 1, loadPage);
}

async function loadAdjacentPage(
  pagination: WorkspaceListPagination,
  nextPageIndex: number,
  loadPage: () => Promise<void>,
): Promise<void> {
  const previousPageIndex = pagination.pageIndex();
  const revision = resultRevision(pagination);
  const previousRevision = revision();
  pagination.pageIndex.set(nextPageIndex);
  try {
    await loadPage();
  } catch (error) {
    if (revision() === previousRevision) {
      pagination.pageIndex.set(previousPageIndex);
    }
    throw error;
  }

  if (revision() === previousRevision) {
    pagination.pageIndex.set(previousPageIndex);
  }
}

function resultRevision(pagination: WorkspaceListPagination): WritableSignal<number> {
  const existing = resultRevisions.get(pagination);
  if (existing) {
    return existing;
  }
  const revision = signal(0);
  resultRevisions.set(pagination, revision);
  return revision;
}
