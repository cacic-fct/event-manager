import type { Route } from '@playwright/test';
import type { DefaultRedirectRoute } from '@cacic-fct/event-manager-public-contracts/types';

const CURRENT_USER_DEFAULT_REDIRECT_OPERATION = 'query CurrentUserDefaultRedirect';

export async function fulfillCurrentUserDefaultRedirect(
  route: Route,
  query: string,
  defaultRedirect: DefaultRedirectRoute = 'MENU',
): Promise<boolean> {
  if (!query.includes(CURRENT_USER_DEFAULT_REDIRECT_OPERATION)) {
    return false;
  }

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { currentUserDefaultRedirect: defaultRedirect } }),
  });
  return true;
}
