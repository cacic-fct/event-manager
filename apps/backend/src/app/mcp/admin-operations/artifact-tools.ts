import type { McpServer } from '@modelcontextprotocol/server';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { MCP_ADMIN_PROPOSE_SCOPE, MCP_ADMIN_READ_SCOPE } from '../mcp-admin.config';
import { mcpUserId } from '../shared/principal';
import { MCP_PROPOSAL_ANNOTATIONS, MCP_READ_ANNOTATIONS, type ExecuteMcpTool } from '../shared/transport';
import { McpAdminFileArtifactService, MCP_FILE_CHUNK_BYTES } from './artifact-files';

const ownerSchema = z.strictObject({ delegationId: z.uuid(), operation: z.string().min(1).max(100) });
const fileSchema = z.strictObject({
  ...ownerSchema.shape,
  purpose: z.enum(['team-logo', 'form-image', 'data-transfer-document']),
  target: z.record(z.string().min(1).max(100), z.string().max(200)).refine((value) => Object.keys(value).length <= 20),
  fileName: z.string().min(1).max(200),
  contentType: z.string().min(3).max(100),
  expectedSizeBytes: z
    .number()
    .int()
    .min(0)
    .max(64 * 1024 * 1024),
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

@Injectable()
export class McpAdminArtifactTools {
  constructor(private readonly artifacts: McpAdminFileArtifactService) {}

  register(server: McpServer, user: AuthenticatedUser, execute: ExecuteMcpTool, allowed: ReadonlySet<string>) {
    const uploads = [
      'uploadSportsTeamLogo',
      'uploadEventFormImage',
      'uploadPendingEventFormImage',
      'previewDataTransfer',
      'applyDataTransfer',
    ];
    const fileOperations = [
      ...uploads,
      'exportDataTransfer',
      'downloadSportsTeamLogo',
      'downloadEventFormImage',
      'downloadEventFormImageById',
      'exportEventFormResultsCsv',
      'exportEventSubscriptionBadgesZip',
      'exportMajorEventSubscriptionBadgesZip',
      'downloadCertificate',
      'exportCertificateFile',
    ];
    if (!fileOperations.some((operation) => allowed.has(operation))) return;
    const identity = { userId: mcpUserId(user), clientId: String(user.claims['azp']) };
    const write = (operation: string) => {
      if (operation === 'previewDataTransfer' && user.oidcScopeSet.has(MCP_ADMIN_READ_SCOPE)) return;
      if (!user.oidcScopeSet.has(MCP_ADMIN_PROPOSE_SCOPE))
        throw new ForbiddenException('Escopo de propostas necessário.');
    };
    if (
      (uploads.some((operation) => allowed.has(operation)) && user.oidcScopeSet.has(MCP_ADMIN_PROPOSE_SCOPE)) ||
      (allowed.has('previewDataTransfer') && user.oidcScopeSet.has(MCP_ADMIN_READ_SCOPE))
    ) {
      server.registerTool(
        'begin_admin_file',
        {
          title: 'Preparar arquivo administrativo',
          description:
            'Stage an immutable private file for a delegated upload or transfer proposal. This never changes a domain resource. Send chunks, then finalize the hash before proposing.',
          inputSchema: fileSchema,
          annotations: { ...MCP_PROPOSAL_ANNOTATIONS, idempotentHint: false },
        },
        (input) =>
          execute(async () => {
            write(input.operation);
            return this.artifacts.begin({ ...input, ...identity });
          }),
      );
      server.registerTool(
        'append_admin_file',
        {
          title: 'Enviar trecho do arquivo',
          description:
            'Append a base64 chunk to an own delegated staged file, using the returned byte offset. Maximum decoded chunk: 48 KiB.',
          inputSchema: z.strictObject({
            ...ownerSchema.shape,
            artifactId: z.uuid(),
            offset: z.number().int().min(0),
            base64: z.string().max(Math.ceil(MCP_FILE_CHUNK_BYTES / 3) * 4),
          }),
          annotations: MCP_PROPOSAL_ANNOTATIONS,
        },
        ({ artifactId, offset, base64, ...owner }) =>
          execute(async () => {
            write(owner.operation);
            return this.artifacts.append({ ...owner, ...identity }, artifactId, offset, base64);
          }),
      );
      server.registerTool(
        'finalize_admin_file',
        {
          title: 'Conferir arquivo enviado',
          description: 'Verify size and SHA-256 before an immutable file reference can be proposed for human approval.',
          inputSchema: z.strictObject({ ...ownerSchema.shape, artifactId: z.uuid() }),
          annotations: MCP_PROPOSAL_ANNOTATIONS,
        },
        ({ artifactId, ...owner }) =>
          execute(async () => {
            write(owner.operation);
            return this.artifacts.finalize({ ...owner, ...identity }, artifactId);
          }),
      );
    }
    server.registerTool(
      'read_admin_file_chunk',
      {
        title: 'Ler trecho de arquivo administrativo',
        description:
          'Read an own private export or staged artifact in bounded base64 chunks. Requires its exact active operation delegation.',
        inputSchema: z.strictObject({ ...ownerSchema.shape, artifactId: z.uuid(), offset: z.number().int().min(0) }),
        annotations: MCP_READ_ANNOTATIONS,
      },
      (input) =>
        execute(async () => {
          if (!user.oidcScopeSet.has(MCP_ADMIN_READ_SCOPE))
            throw new ForbiddenException('Escopo de leitura necessário.');
          return this.artifacts.readChunk({ ...input, ...identity }, user);
        }),
    );
  }
}
