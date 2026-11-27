import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, type CallToolResult, type McpServer } from '@modelcontextprotocol/server';
import { HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';

const MAX_REQUEST_BODY_BYTES = 100 * 1024;
export const MCP_PROTOCOL_VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18'];

export const MCP_PROTOCOL_METHODS = new Set([
  'initialize',
  'notifications/initialized',
  'ping',
  'server/discover',
  'tools/list',
  'tools/call',
]);

export type ExecuteMcpTool = (work: () => Promise<unknown>) => Promise<CallToolResult>;
export type McpOperationOutcome = 'SUCCEEDED' | 'DENIED' | 'FAILED';

export const MCP_READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const MCP_PROPOSAL_ANNOTATIONS = { ...MCP_READ_ANNOTATIONS, readOnlyHint: false };

export async function handleMcpRequest(
  request: Request,
  response: Response,
  operation: string,
  createServer: (execute: ExecuteMcpTool) => Promise<McpServer>,
  recordOutcome: (outcome: McpOperationOutcome) => Promise<void>,
): Promise<void> {
  let outcome: McpOperationOutcome = operation === 'unsupported' ? 'DENIED' : 'SUCCEEDED';
  let invoked = false;
  let completeTool: (() => void) | undefined;
  const toolCompleted = new Promise<void>((resolve) => {
    completeTool = resolve;
  });
  const handler = createMcpHandler(
    () =>
      createServer(async (work) => {
        invoked = true;
        try {
          const result: unknown = JSON.parse(JSON.stringify(await work()));
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
            structuredContent: result as Record<string, unknown>,
          };
        } catch (error) {
          outcome = error instanceof HttpException && error.getStatus() < 500 ? 'DENIED' : 'FAILED';
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text:
                  error instanceof HttpException && error.getStatus() < 500
                    ? error.message
                    : 'Não foi possível concluir a operação MCP.',
              },
            ],
          };
        } finally {
          completeTool?.();
        }
      }),
    {
      legacy: 'stateless',
      maxRequestBodySize: MAX_REQUEST_BODY_BYTES,
      maxSubscriptions: 0,
      onerror: () => {
        if (!invoked) outcome = 'DENIED';
      },
    },
  );
  const nodeHandler = toNodeHandler(
    {
      fetch: async (webRequest, options) => {
        try {
          const result = await handler.fetch(webRequest, options);
          result.headers.set('Cache-Control', 'no-store');
          if (!invoked && result.status >= 500) outcome = 'FAILED';
          else if (!invoked && result.status >= 400) outcome = 'DENIED';
          return result;
        } catch (error) {
          if (!invoked) outcome = 'FAILED';
          throw error;
        }
      },
    },
    { maxRequestBodySize: MAX_REQUEST_BODY_BYTES },
  );
  try {
    await nodeHandler(request, response, request.body);
  } finally {
    // The adapter consumes SSE, or returns on disconnect. A started domain
    // operation must settle before either its log or its server is finalized.
    try {
      if (invoked) await toolCompleted;
      await handler.close();
    } finally {
      if (invoked) await toolCompleted;
      else if (operation.startsWith('tool:') && outcome === 'SUCCEEDED') outcome = 'DENIED';
      await recordOutcome(outcome);
    }
  }
}
