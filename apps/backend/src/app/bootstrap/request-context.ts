import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,63}$/;

type RequestContext = {
  requestId: string;
};

const requestContext = new AsyncLocalStorage<RequestContext>();

export function requestContextMiddleware(request: Request, response: Response, next: NextFunction): void {
  const suppliedRequestId = request.header(REQUEST_ID_HEADER)?.trim();
  const requestId = suppliedRequestId && REQUEST_ID_PATTERN.test(suppliedRequestId) ? suppliedRequestId : randomUUID();
  response.setHeader(REQUEST_ID_HEADER, requestId);
  requestContext.run({ requestId }, next);
}

export function currentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}
