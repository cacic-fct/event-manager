import { applyPagedResult, createWorkspaceListPagination, loadNextPage, loadPreviousPage } from './list-pagination';

describe('workspace list pagination', () => {
  it('moves to the previous page and reloads', async () => {
    const pagination = createWorkspaceListPagination();
    const loadPage = vi.fn(() => Promise.resolve());

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
    const loadPage = vi.fn(() => Promise.resolve());

    await loadNextPage(pagination, loadPage);
    expect(pagination.pageIndex()).toBe(0);
    expect(loadPage).not.toHaveBeenCalled();

    applyPagedResult(Array.from({ length: 51 }, (_, index) => index), pagination);

    await loadNextPage(pagination, loadPage);

    expect(pagination.pageIndex()).toBe(1);
    expect(loadPage).toHaveBeenCalledOnce();
  });
});
