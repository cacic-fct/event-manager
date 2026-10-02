import { applyPagedResult, createWorkspaceListPagination, loadNextPage, loadPreviousPage, resetPagination } from './list-pagination';

describe('workspace list pagination', () => {
  it('reports only displayed records, including partial and empty pages', () => {
    const pagination = createWorkspaceListPagination();
    expect(pagination.label()).toBe('0');
    applyPagedResult(['one'], pagination);
    expect(pagination.label()).toBe('1-1');
    applyPagedResult(Array.from({length:51}, (_, index) => index), pagination);
    expect(pagination.label()).toBe('1-50');
    pagination.pageIndex.set(1);
    applyPagedResult(['last', 'two'], pagination);
    expect(pagination.label()).toBe('51-52');
    expect(pagination.hasNextPage()).toBe(false);
    resetPagination(pagination);
    expect(pagination.label()).toBe('0');
  });

  it('moves to the previous page and reloads', async () => {
    const pagination = createWorkspaceListPagination();
    const loadPage = vi.fn(async () => {
      applyPagedResult(['previous'], pagination);
    });

    pagination.pageIndex.set(2);

    await loadPreviousPage(pagination, loadPage);

    expect(pagination.pageIndex()).toBe(1);
    expect(loadPage).toHaveBeenCalledOnce();
  });

  it('does not move past the first page', async () => {
    const pagination = createWorkspaceListPagination();
    const loadPage = vi.fn(() => Promise.resolve());

    await loadPreviousPage(pagination, loadPage);

    expect(pagination.pageIndex()).toBe(0);
    expect(loadPage).toHaveBeenCalledOnce();
  });

  it('moves to the next page only when there is one', async () => {
    const pagination = createWorkspaceListPagination();
    const loadPage = vi.fn(async () => {
      applyPagedResult(['next'], pagination);
    });

    await loadNextPage(pagination, loadPage);
    expect(pagination.pageIndex()).toBe(0);
    expect(loadPage).not.toHaveBeenCalled();

    applyPagedResult(
      Array.from({ length: 51 }, (_, index) => index),
      pagination,
    );

    await loadNextPage(pagination, loadPage);

    expect(pagination.pageIndex()).toBe(1);
    expect(loadPage).toHaveBeenCalledOnce();
  });

  it('restores the previous page when loading rejects before applying a result', async () => {
    const pagination = createWorkspaceListPagination();
    applyPagedResult(Array.from({ length: 51 }, (_, index) => index), pagination);

    await expect(loadNextPage(pagination, () => Promise.reject(new Error('offline')))).rejects.toThrow('offline');

    expect(pagination.pageIndex()).toBe(0);
  });

  it('restores the previous page when a handled failure applies no result', async () => {
    const pagination = createWorkspaceListPagination();
    applyPagedResult(Array.from({ length: 51 }, (_, index) => index), pagination);

    await loadNextPage(pagination, () => Promise.resolve());

    expect(pagination.pageIndex()).toBe(0);
  });
});
