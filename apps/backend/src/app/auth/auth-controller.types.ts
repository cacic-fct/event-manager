import { Request } from 'express';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

export type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};

export type PermissionEvaluationBody = {
  permissions?: unknown;
};
