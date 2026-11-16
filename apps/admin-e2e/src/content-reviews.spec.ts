import { expect, test } from './support/e2e-test';
import { authenticatedAdminUserFixture, mockAdminApi, preventSilentSso } from './support/admin-e2e-fixtures';

test('confirms a material removal and uses the refreshed revision to reject the remaining proposal', async ({
  page,
}) => {
  await preventSilentSso(page);
  await mockAdminApi(page, {
    user: authenticatedAdminUserFixture(),
    permissions: ['event-materials#review'],
  });

  const submitted = new Date().toISOString();
  let revision = 4;
  let items = [
    {
      key: 'slides',
      authorName: 'Ana',
      fields: [],
      beforeMaterial: { title: 'Slides', url: 'https://example.org/slides', releaseAfterEvent: false },
      afterMaterial: null,
    },
    {
      key: 'exercises',
      authorName: 'Ana',
      fields: [],
      beforeMaterial: null,
      afterMaterial: { title: 'Exercícios', url: 'https://example.org/exercises', releaseAfterEvent: true },
    },
  ];
  const decisions: unknown[] = [];
  await page.route('**/api/graphql', async (route) => {
    const { query, variables } = route.request().postDataJSON() as {
      query: string;
      variables: { keys?: string[] };
    };

    if (query.includes('query ContentReviews(')) {
      const group = {
        id: 'review-1',
        revision,
        updatedAt: submitted,
        targetName: 'Oficina de Angular',
        isProfile: false,
        items,
      };
      await route.fulfill({
        json: {
          data: { contentReviews: { groups: items.length ? [group] : [], hasNextPage: false } },
        },
      });
    } else if (query.includes('mutation DecideContentReview(')) {
      decisions.push(variables);
      items = items.filter(({ key }) => !variables.keys?.includes(key));
      revision++;
      await route.fulfill({ json: { data: { decideContentReview: true } } });
    } else {
      await route.fallback();
    }
  });

  await page.goto('/admin/content-reviews');
  const approveRemoval = page.getByRole('button', { name: 'Aprovar - Remover material - Slides', exact: true });
  const dialog = page.getByRole('dialog');
  await approveRemoval.click();
  await expect(dialog.getByRole('heading', { name: 'Aprovar alterações nos materiais?' })).toBeVisible();
  await expect(
    dialog.getByText('Os materiais marcados para remoção deixarão de aparecer para os inscritos.'),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(approveRemoval).toBeFocused();
  expect(decisions).toEqual([]);

  await approveRemoval.click();
  await dialog.getByRole('button', { name: 'Aprovar', exact: true }).click();
  await expect(approveRemoval).toHaveCount(0);
  await expect(page.getByText('Alterações aprovadas.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Alterações pendentes' })).toBeFocused();

  await page.getByRole('button', { name: 'Rejeitar - Adicionar material - Exercícios', exact: true }).click();
  await expect(page.getByText('Nenhuma alteração aguarda revisão.', { exact: true })).toBeVisible();

  expect(decisions).toEqual([
    { id: 'review-1', revision: 4, keys: ['slides'], decision: 'APPROVE' },
    { id: 'review-1', revision: 5, keys: ['exercises'], decision: 'REJECT' },
  ]);
});
