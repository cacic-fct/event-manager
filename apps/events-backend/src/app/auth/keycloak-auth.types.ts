import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

export type TokenClaims = Record<string, unknown> & {
  active?: boolean;
};

export interface CachedUser {
  user: AuthenticatedUser;
  expiresAt: number;
}

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  idTokenHint?: string;
  accessTokenExpiresAt: number;
  sessionExpiresAt: number;
}

export interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
}
