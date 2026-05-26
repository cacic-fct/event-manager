import { isDevMode } from '@angular/core';
import { CanActivateFn } from '@angular/router';

export const developmentOnlyGuard: CanActivateFn = () => {
  return isDevMode();
};
