import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { AuthSession } from './keycloak-auth.types';

@Injectable()
export class AuthSessionStoreService {
  private readonly logger = new Logger(AuthSessionStoreService.name);
  private readonly keyPrefix = process.env.KEYCLOAK_AUTH_SESSION_REDIS_PREFIX ?? 'auth:session:';

  constructor(private readonly redis: Redis) {}

  async set(sessionId: string, session: AuthSession): Promise<void> {
    const ttlSeconds = this.resolveTtlSeconds(session.sessionExpiresAt);
    if (ttlSeconds <= 0) {
      await this.delete(sessionId);
      return;
    }

    await this.redis.set(this.getKey(sessionId), JSON.stringify(session), 'EX', ttlSeconds);
  }

  async get(sessionId: string): Promise<AuthSession | null> {
    const rawSession = await this.redis.get(this.getKey(sessionId));
    if (!rawSession) {
      return null;
    }

    try {
      const session = JSON.parse(rawSession) as AuthSession;
      if (!this.isValidSession(session)) {
        await this.delete(sessionId);
        return null;
      }

      if (session.sessionExpiresAt <= Date.now()) {
        await this.delete(sessionId);
        return null;
      }

      return session;
    } catch {
      this.logger.warn(`Ignoring unreadable auth session ${sessionId}.`);
      await this.delete(sessionId);
      return null;
    }
  }

  async delete(sessionId: string): Promise<void> {
    await this.redis.del(this.getKey(sessionId));
  }

  private getKey(sessionId: string): string {
    return `${this.keyPrefix}${sessionId}`;
  }

  private resolveTtlSeconds(expiresAt: number): number {
    return Math.ceil((expiresAt - Date.now()) / 1000);
  }

  private isValidSession(session: AuthSession): boolean {
    return (
      typeof session.accessToken === 'string' &&
      typeof session.accessTokenExpiresAt === 'number' &&
      typeof session.sessionExpiresAt === 'number' &&
      (session.refreshToken === undefined || typeof session.refreshToken === 'string') &&
      (session.idTokenHint === undefined || typeof session.idTokenHint === 'string')
    );
  }
}
