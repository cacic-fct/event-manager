import { OnModuleDestroy } from '@nestjs/common';
import { Readable } from 'node:stream';

export class InMemoryRedisClient implements OnModuleDestroy {
  private readonly values = new Map<string, string>();
  private readonly hashes = new Map<string, Map<string, string>>();
  private readonly lists = new Map<string, string[]>();
  private readonly expirations = new Map<string, number>();

  async get(key: string): Promise<string | null> {
    this.deleteIfExpired(key);
    if (this.hashes.has(key) || this.lists.has(key)) {
      throw new Error(`WRONGTYPE Operation against a key holding the wrong kind of value: ${key}`);
    }
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string, ...args: unknown[]): Promise<'OK' | null> {
    this.deleteIfExpired(key);

    if (this.usesNx(args) && (this.values.has(key) || this.hashes.has(key) || this.lists.has(key))) {
      return null;
    }

    this.values.set(key, value);
    this.hashes.delete(key);
    this.lists.delete(key);
    this.setExpiration(key, args);
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      this.expirations.delete(key);
      const deletedValue = this.values.delete(key);
      const deletedHash = this.hashes.delete(key);
      const deletedList = this.lists.delete(key);
      if (deletedValue || deletedHash || deletedList) {
        deleted += 1;
      }
    }
    return deleted;
  }

  async exists(key: string): Promise<number> {
    this.deleteIfExpired(key);
    return this.values.has(key) || this.hashes.has(key) || this.lists.has(key) ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const current = await this.get(key);
    const next = Number(current ?? '0') + 1;
    if (!Number.isSafeInteger(next)) {
      throw new Error('ERR increment or decrement would overflow');
    }
    await this.set(key, next.toString());
    return next;
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    this.deleteIfExpired(key);
    if (this.values.has(key) || this.hashes.has(key)) {
      throw new Error(`WRONGTYPE Operation against a key holding the wrong kind of value: ${key}`);
    }
    const list = this.lists.get(key) ?? [];
    list.unshift(...values);
    this.lists.set(key, list);
    return list.length;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    this.deleteIfExpired(key);
    if (this.values.has(key) || this.hashes.has(key)) {
      throw new Error(`WRONGTYPE Operation against a key holding the wrong kind of value: ${key}`);
    }
    const list = this.lists.get(key) ?? [];
    const normalizedStart = start < 0 ? Math.max(list.length + start, 0) : start;
    const normalizedStop = stop < 0 ? list.length + stop : stop;
    return list.slice(normalizedStart, normalizedStop + 1);
  }

  async ltrim(key: string, start: number, stop: number): Promise<'OK'> {
    const values = await this.lrange(key, start, stop);
    this.lists.set(key, values);
    return 'OK';
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.deleteIfExpired(key);
    if (!this.values.has(key) && !this.hashes.has(key) && !this.lists.has(key)) {
      return 0;
    }
    this.expirations.set(key, Date.now() + seconds * 1000);
    return 1;
  }

  async eval(script: string, keyCount: number, ...args: unknown[]): Promise<unknown> {
    const keys = args.slice(0, keyCount).map(String);
    const values = args.slice(keyCount);

    if (script.includes('redis.call("get", KEYS[1]) == ARGV[1]')) {
      const key = keys[0];
      const owner = String(values[0]);
      if ((await this.get(key)) === owner) {
        return this.del(key);
      }
      return 0;
    }

    if (script.includes('redis.call("get", KEYS[1])') && script.includes('redis.call("del", KEYS[1])')) {
      const key = keys[0];
      const value = await this.get(key);
      if (value !== null) {
        await this.del(key);
      }
      return value;
    }

    if (this.isRateLimitScript(script)) {
      return this.consumeRateLimit(keys[0], values);
    }

    throw new Error('Unsupported in-memory Redis eval script.');
  }

  scanStream(options: { match?: string } = {}): Readable {
    return Readable.from([this.keys(options.match)]);
  }

  disconnect(): void {
    this.values.clear();
    this.hashes.clear();
    this.lists.clear();
    this.expirations.clear();
  }

  onModuleDestroy(): void {
    this.disconnect();
  }

  private usesNx(args: unknown[]): boolean {
    return args.some((arg) => typeof arg === 'string' && arg.toUpperCase() === 'NX');
  }

  private isRateLimitScript(script: string): boolean {
    return (
      script.includes("redis.call('HMGET'") &&
      script.includes("redis.call('HSET'") &&
      script.includes("redis.call('PEXPIRE'")
    );
  }

  private consumeRateLimit(key: string, args: unknown[]): number[] {
    this.deleteIfExpired(key);

    const now = this.numberArg(args, 0);
    const windowMs = this.numberArg(args, 1);
    const freeAttempts = this.numberArg(args, 2);
    const maxAttempts = this.numberArg(args, 3);
    const baseCooldownMs = this.numberArg(args, 4);
    const maxCooldownMs = this.numberArg(args, 5);
    const state = this.hashes.get(key);
    let attempts = Number(state?.get('attempts')) || 0;
    let windowResetMs = Number(state?.get('windowResetMs')) || 0;
    let blockedUntilMs = Number(state?.get('blockedUntilMs')) || 0;

    if (windowResetMs <= now) {
      attempts = 0;
      windowResetMs = now + windowMs;
      blockedUntilMs = 0;
    }

    const resetSeconds = Math.max(Math.ceil((windowResetMs - now) / 1000), 0);
    if (blockedUntilMs > now) {
      const retryAfterSeconds = Math.ceil((blockedUntilMs - now) / 1000);
      return [
        0,
        attempts,
        this.remainingAttempts(attempts, freeAttempts, maxAttempts),
        retryAfterSeconds,
        resetSeconds,
        retryAfterSeconds,
      ];
    }

    if (maxAttempts > 0 && attempts >= maxAttempts) {
      return [0, attempts, 0, resetSeconds, resetSeconds, 0];
    }

    attempts += 1;

    let cooldownMs = 0;
    if (attempts > freeAttempts) {
      cooldownMs = baseCooldownMs;
      for (let exponent = attempts - freeAttempts - 1; exponent > 0; exponent -= 1) {
        cooldownMs *= 2;
        if (cooldownMs >= maxCooldownMs) {
          cooldownMs = maxCooldownMs;
          break;
        }
      }

      blockedUntilMs = now + Math.min(cooldownMs, maxCooldownMs);
    } else {
      blockedUntilMs = 0;
    }

    this.values.delete(key);
    this.hashes.set(
      key,
      new Map([
        ['attempts', attempts.toString()],
        ['windowResetMs', windowResetMs.toString()],
        ['blockedUntilMs', blockedUntilMs.toString()],
      ]),
    );
    this.expirations.set(key, now + Math.max(1, windowResetMs - now));

    return [
      1,
      attempts,
      this.remainingAttempts(attempts, freeAttempts, maxAttempts),
      0,
      resetSeconds,
      Math.ceil(cooldownMs / 1000),
    ];
  }

  private numberArg(args: unknown[], index: number): number {
    const value = Number(args[index]);
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid Redis script argument at index ${index}.`);
    }
    return value;
  }

  private remainingAttempts(attempts: number, freeAttempts: number, maxAttempts: number): number {
    const limit = maxAttempts > 0 ? maxAttempts : freeAttempts;
    return Math.max(limit - attempts, 0);
  }

  private setExpiration(key: string, args: unknown[]): void {
    const expirationIndex = args.findIndex(
      (arg) => typeof arg === 'string' && ['EX', 'PX'].includes(arg.toUpperCase()),
    );
    if (expirationIndex === -1) {
      this.expirations.delete(key);
      return;
    }

    const mode = String(args[expirationIndex]).toUpperCase();
    const rawDuration = Number(args[expirationIndex + 1]);
    if (!Number.isFinite(rawDuration) || rawDuration <= 0) {
      this.expirations.delete(key);
      return;
    }

    this.expirations.set(key, Date.now() + (mode === 'EX' ? rawDuration * 1000 : rawDuration));
  }

  private deleteIfExpired(key: string): void {
    const expiresAt = this.expirations.get(key);
    if (expiresAt !== undefined && expiresAt <= Date.now()) {
      this.expirations.delete(key);
      this.values.delete(key);
      this.hashes.delete(key);
      this.lists.delete(key);
    }
  }

  private keys(pattern?: string): string[] {
    for (const key of [...this.values.keys(), ...this.hashes.keys(), ...this.lists.keys()]) {
      this.deleteIfExpired(key);
    }

    const keys = [...new Set([...this.values.keys(), ...this.hashes.keys(), ...this.lists.keys()])];
    if (!pattern) {
      return keys;
    }

    const matcher = new RegExp(`^${pattern.split('*').map(InMemoryRedisClient.escapeRegex).join('.*')}$`);
    return keys.filter((key) => matcher.test(key));
  }

  private static escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
