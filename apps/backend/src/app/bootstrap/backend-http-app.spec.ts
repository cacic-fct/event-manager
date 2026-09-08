import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createBackendHttpApp } from './backend-http-app';

jest.mock('../app.module', () => ({ AppModule: class AppModule {} }));

describe('createBackendHttpApp ownership', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([false, true])('closes an allocated app and preserves configuration failure (cleanup fails: %s)', async (cleanupFails) => {
    const original = new Error('configuration failed');
    const close = cleanupFails ? jest.fn().mockRejectedValue(new Error('cleanup failed')) : jest.fn().mockResolvedValue(undefined);
    const app = { getHttpAdapter: () => { throw original; }, close };
    jest.spyOn(NestFactory, 'create').mockResolvedValue(app as never);
    const errorLog = jest.spyOn(Logger, 'error').mockImplementation(() => undefined);

    await expect(createBackendHttpApp()).rejects.toBe(original);

    expect(close).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledTimes(cleanupFails ? 1 : 0);
  });
});
