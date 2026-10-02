import { InjectionToken } from '@angular/core';

/** Marks routed content whose event selector and navigation are supplied by the shell. */
export const ADMIN_SHELL_CONTEXT = new InjectionToken<boolean>('Admin shell context');
