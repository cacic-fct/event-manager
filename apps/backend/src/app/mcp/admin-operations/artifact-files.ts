import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ADMIN_MCP_OPERATIONS } from './catalog';
import { adminMcpExecution } from './execution-context';
import { McpAdminConfig } from '../mcp-admin.config';

const MAX_FILE_BYTES = 64 * 1024 * 1024;
export const MCP_FILE_CHUNK_BYTES = 48 * 1024;
const UPLOAD_OPERATIONS: Readonly<Record<string, string>> = {
  uploadSportsTeamLogo: 'team-logo',
  uploadEventFormImage: 'form-image',
  uploadPendingEventFormImage: 'form-image',
  previewDataTransfer: 'data-transfer-document',
  applyDataTransfer: 'data-transfer-document',
};

export interface ArtifactOwner {
  userId: string;
  clientId: string;
  delegationId: string;
  operation: string;
}
export interface ArtifactInput extends ArtifactOwner {
  purpose: string;
  target: Record<string, string>;
  fileName: string;
  contentType: string;
  expectedSizeBytes: number;
  expectedSha256: string;
}
export interface ArtifactReference {
  artifactId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  expiresAt: Date;
}

@Injectable()
export class McpAdminFileArtifactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly config: McpAdminConfig,
  ) {}

  private async delegation(owner: ArtifactOwner, tx: Prisma.TransactionClient = this.prisma, requireEnabled = true) {
    if ((requireEnabled && !this.config.enabled) || !this.config.allowedClients.includes(owner.clientId))
      throw new ForbiddenException('Operação MCP indisponível.');
    const grant = await tx.mcpAdminOperationDelegation.findFirst({
      where: {
        id: owner.delegationId,
        userId: owner.userId,
        clientId: owner.clientId,
        resource: this.config.resourceUrl,
        operations: { has: owner.operation },
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!grant) throw new ForbiddenException('Delegação de arquivo indisponível.');
    return grant;
  }

  private assertStagingAllowed(operation: string): void {
    if (!this.config.enabled) throw new ForbiddenException('Operação MCP indisponível.');
    const definition = ADMIN_MCP_OPERATIONS.find((entry) => entry.field === operation);
    const kind = definition?.kind ?? (UPLOAD_OPERATIONS[operation] ? 'mutation' : undefined);
    if (!kind) throw new BadRequestException('Operação de arquivo inválida.');
    if (kind === 'mutation' && !this.config.proposalsEnabled)
      throw new ForbiddenException('Propostas administrativas desativadas.');
  }

  async begin(input: ArtifactInput, exported = false): Promise<ArtifactReference> {
    if ((exported && input.purpose !== 'export') || (!exported && UPLOAD_OPERATIONS[input.operation] !== input.purpose))
      throw new BadRequestException('Operação ou finalidade de arquivo inválida.');
    if (!exported) this.assertStagingAllowed(input.operation);
    if (
      !Number.isInteger(input.expectedSizeBytes) ||
      input.expectedSizeBytes < 0 ||
      input.expectedSizeBytes > MAX_FILE_BYTES ||
      !/^[a-f0-9]{64}$/.test(input.expectedSha256) ||
      !/^[\w.+-]+\/[\w.+-]+$/.test(input.contentType) ||
      !input.fileName ||
      input.fileName.length > 200 ||
      input.fileName.includes('/') ||
      input.fileName.includes('\\') ||
      [...input.fileName].some((character) => character.charCodeAt(0) < 32)
    )
      throw new BadRequestException('Metadados do arquivo inválidos ou excessivos.');
    await this.cleanup();
    const artifact = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "mcp_admin_operation_delegations" WHERE "id" = ${input.delegationId} FOR UPDATE`;
      const grant = await this.delegation(input, tx);
      const existing = await tx.mcpAdminFileArtifact.aggregate({
        where: { delegationId: grant.id },
        _count: true,
        _sum: { sizeBytes: true },
      });
      if (existing._count >= 20 || (existing._sum.sizeBytes ?? 0) + input.expectedSizeBytes > 128 * 1024 * 1024)
        throw new BadRequestException('Limite de arquivos temporários atingido. Aguarde a expiração.');
      return tx.mcpAdminFileArtifact.create({
        data: {
          delegationId: grant.id,
          operation: input.operation,
          purpose: input.purpose,
          target: input.target,
          fileName: input.fileName,
          contentType: input.contentType,
          sizeBytes: input.expectedSizeBytes,
          sha256: input.expectedSha256,
          expiresAt: new Date(Math.min(grant.expiresAt.getTime(), Date.now() + 24 * 60 * 60_000)),
        },
      });
    });
    return this.reference(artifact);
  }

  private reference(file: {
    id: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    sha256: string;
    expiresAt: Date;
  }): ArtifactReference {
    return {
      artifactId: file.id,
      fileName: file.fileName,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
      expiresAt: file.expiresAt,
    };
  }

  private async owned(
    owner: ArtifactOwner,
    id: string,
    tx: Prisma.TransactionClient = this.prisma,
    requireEnabled = true,
  ) {
    await this.delegation(owner, tx, requireEnabled);
    const file = await tx.mcpAdminFileArtifact.findFirst({
      where: {
        id,
        delegationId: owner.delegationId,
        expiresAt: { gt: new Date() },
        ...(owner.operation === 'previewDataTransfer' || owner.operation === 'applyDataTransfer'
          ? {
              OR: [
                { operation: owner.operation },
                { purpose: 'data-transfer-document', operation: { in: ['previewDataTransfer', 'applyDataTransfer'] } },
              ],
            }
          : { operation: owner.operation }),
      },
    });
    if (!file) throw new NotFoundException('Arquivo temporário indisponível.');
    return file;
  }

  private async completeBytes(
    file: { id: string; sizeBytes: number; uploadedBytes: number; sha256: string },
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<Buffer> {
    if (file.uploadedBytes !== file.sizeBytes)
      throw new BadRequestException('O arquivo está incompleto ou o hash não confere.');
    const chunks = await tx.mcpAdminFileArtifactChunk.findMany({
      where: { artifactId: file.id },
      orderBy: { offset: 'asc' },
      select: { offset: true, bytes: true },
    });
    const hash = createHash('sha256');
    const parts: Buffer[] = [];
    let expectedOffset = 0;
    for (const row of chunks) {
      const bytes = Buffer.from(row.bytes);
      const expectedLength = Math.min(MCP_FILE_CHUNK_BYTES, file.sizeBytes - expectedOffset);
      if (row.offset !== expectedOffset || expectedLength <= 0 || bytes.length !== expectedLength)
        throw new BadRequestException('O arquivo está incompleto ou o hash não confere.');
      parts.push(bytes);
      hash.update(bytes);
      expectedOffset += bytes.length;
    }
    if (expectedOffset !== file.sizeBytes || hash.digest('hex') !== file.sha256)
      throw new BadRequestException('O arquivo está incompleto ou o hash não confere.');
    return Buffer.concat(parts, file.sizeBytes);
  }

  private async assertCurrentExportPermission(
    file: { operation: string; purpose: string; target: Prisma.JsonValue },
    user: AuthenticatedUser,
  ): Promise<void> {
    if (file.purpose !== 'export') return;
    const operation = ADMIN_MCP_OPERATIONS.find((entry) => entry.field === file.operation);
    if (!operation || operation.permissions.length === 0)
      throw new ForbiddenException('Operação de exportação indisponível.');

    const rawTarget = file.target as Record<string, unknown>;
    const target = typeof rawTarget === 'object' && rawTarget !== null ? rawTarget : {};
    const contextTarget =
      typeof target['eventId'] === 'string' ||
      typeof target['eventGroupId'] === 'string' ||
      typeof target['majorEventId'] === 'string'
        ? target
        : target['kind'] === 'event' && typeof target['id'] === 'string'
          ? { eventId: target['id'] }
          : target['kind'] === 'group' && typeof target['id'] === 'string'
            ? { eventGroupId: target['id'] }
            : target['kind'] === 'major-event' && typeof target['id'] === 'string'
              ? { majorEventId: target['id'] }
              : {};
    if (!('eventId' in contextTarget || 'eventGroupId' in contextTarget || 'majorEventId' in contextTarget))
      throw new ForbiddenException('O arquivo de exportação não tem um destino autorizado.');
    const context = this.authorization.buildResourceContext(contextTarget, operation.permissions);
    await this.authorization.assertPermissions(user, operation.permissions, context);
  }

  async append(owner: ArtifactOwner, id: string, offset: number, base64: string) {
    if (
      base64.length > Math.ceil(MCP_FILE_CHUNK_BYTES / 3) * 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)
    )
      throw new BadRequestException('Trecho do arquivo inválido ou excessivo.');
    const chunk = Buffer.from(base64, 'base64');
    return this.prisma.$transaction(async (tx) => {
      const file = await this.owned(owner, id, tx);
      if (file.purpose !== 'export') this.assertStagingAllowed(file.operation);
      if (!Number.isInteger(offset) || offset < 0 || offset > file.sizeBytes || offset % MCP_FILE_CHUNK_BYTES !== 0)
        throw new BadRequestException('Posição de envio inválida.');

      if (file.sizeBytes === 0 && offset === 0 && chunk.length === 0 && file.uploadedBytes === 0 && !file.ready)
        return { uploadedBytes: 0 };
      if (offset >= file.sizeBytes) throw new BadRequestException('Posição de envio inválida.');

      const expectedLength = Math.min(MCP_FILE_CHUNK_BYTES, file.sizeBytes - offset);
      if (chunk.length !== expectedLength)
        throw new BadRequestException('O trecho deve preencher o próximo bloco completo.');
      if (offset < file.uploadedBytes) {
        const existing = await tx.mcpAdminFileArtifactChunk.findUnique({
          where: { artifactId_offset: { artifactId: id, offset } },
          select: { bytes: true },
        });
        if (existing && Buffer.from(existing.bytes).equals(chunk)) return { uploadedBytes: file.uploadedBytes };
        throw new ConflictException('O envio foi alterado. Confira a posição.');
      }
      if (file.ready || offset !== file.uploadedBytes)
        throw new ConflictException('O envio foi alterado. Confira a posição.');

      const changed = await tx.mcpAdminFileArtifact.updateMany({
        where: {
          id,
          delegationId: owner.delegationId,
          uploadedBytes: offset,
          ready: false,
          expiresAt: { gt: new Date() },
        },
        data: { uploadedBytes: { increment: chunk.length } },
      });
      if (changed.count !== 1) throw new ConflictException('O envio foi alterado. Confira a posição.');
      await tx.mcpAdminFileArtifactChunk.create({ data: { artifactId: id, offset, bytes: chunk } });
      return { uploadedBytes: offset + chunk.length };
    });
  }

  async finalize(owner: ArtifactOwner, id: string): Promise<ArtifactReference> {
    return this.prisma.$transaction(async (tx) => {
      const file = await this.owned(owner, id, tx);
      if (file.purpose !== 'export') this.assertStagingAllowed(file.operation);
      await this.completeBytes(file, tx);
      if (!file.ready) {
        const updated = await tx.mcpAdminFileArtifact.updateMany({
          where: { id, delegationId: owner.delegationId, ready: false, uploadedBytes: file.sizeBytes },
          data: { ready: true },
        });
        if (updated.count !== 1) throw new ConflictException('O envio foi alterado. Confira a posição.');
      }
      return this.reference(file);
    });
  }

  async createUpload(input: ArtifactInput & { bytes: Uint8Array }): Promise<ArtifactReference> {
    const reference = await this.begin(input);
    for (let offset = 0; offset < input.bytes.length; offset += MCP_FILE_CHUNK_BYTES)
      await this.append(
        input,
        reference.artifactId,
        offset,
        Buffer.from(input.bytes.subarray(offset, offset + MCP_FILE_CHUNK_BYTES)).toString('base64'),
      );
    return this.finalize(input, reference.artifactId);
  }

  async loadUpload(
    input: ArtifactOwner & { artifactId: string; expectedSha256?: string; target?: Record<string, string> },
  ): Promise<Buffer> {
    const file = await this.owned(input, input.artifactId);
    if (
      !file.ready ||
      (input.expectedSha256 && file.sha256 !== input.expectedSha256) ||
      (input.target &&
        JSON.stringify(Object.entries(input.target).sort()) !==
          JSON.stringify(Object.entries(file.target as Record<string, string>).sort()))
    )
      throw new BadRequestException('O arquivo não corresponde à proposta.');
    return this.completeBytes(file);
  }

  async createExport(
    input: ArtifactOwner & { target: Record<string, string>; fileName: string; contentType: string; bytes: Uint8Array },
  ): Promise<ArtifactReference> {
    // Only this fixed temporary-file writer leaves the domain read context. It
    // cannot run caller callbacks or write any business model.
    return adminMcpExecution.exit(async () => {
      const metadata = {
        ...input,
        purpose: 'export',
        expectedSizeBytes: input.bytes.length,
        expectedSha256: createHash('sha256').update(input.bytes).digest('hex'),
      };
      const reference = await this.begin(metadata, true);
      for (let offset = 0; offset < input.bytes.length; offset += MCP_FILE_CHUNK_BYTES)
        await this.append(
          input,
          reference.artifactId,
          offset,
          Buffer.from(input.bytes.subarray(offset, offset + MCP_FILE_CHUNK_BYTES)).toString('base64'),
        );
      return this.finalize(input, reference.artifactId);
    });
  }

  async readChunk(owner: ArtifactOwner & { artifactId: string; offset: number }, user: AuthenticatedUser) {
    const file = await this.owned(owner, owner.artifactId);
    if (!file.ready) throw new BadRequestException('O arquivo não corresponde à proposta.');
    if (file.purpose === 'export') {
      await this.assertCurrentExportPermission(file, user);
    }
    if (
      !Number.isInteger(owner.offset) ||
      owner.offset < 0 ||
      owner.offset > file.sizeBytes ||
      (owner.offset !== file.sizeBytes && owner.offset % MCP_FILE_CHUNK_BYTES !== 0)
    )
      throw new BadRequestException('Posição de leitura inválida.');
    if (owner.offset === file.sizeBytes) return { base64: '', offset: owner.offset, nextOffset: null };
    const row = await this.prisma.mcpAdminFileArtifactChunk.findUnique({
      where: { artifactId_offset: { artifactId: file.id, offset: owner.offset } },
      select: { bytes: true },
    });
    if (!row) throw new BadRequestException('O arquivo está incompleto.');
    const chunk = Buffer.from(row.bytes);
    if (chunk.length !== Math.min(MCP_FILE_CHUNK_BYTES, file.sizeBytes - owner.offset))
      throw new BadRequestException('O arquivo está incompleto.');
    return {
      base64: chunk.toString('base64'),
      offset: owner.offset,
      nextOffset: owner.offset + chunk.length < file.sizeBytes ? owner.offset + chunk.length : null,
    };
  }

  async reviewFile(userId: string, artifactId: string, proposalId: string) {
    const command = await this.prisma.mcpAdminCommand.findFirst({
      where: { id: proposalId, state: 'PENDING', expiresAt: { gt: new Date() }, delegation: { userId } },
      include: { delegation: true },
    });
    if (!command) throw new NotFoundException('Proposta indisponível.');
    const file = await this.owned(
      {
        userId,
        clientId: command.delegation.clientId,
        delegationId: command.delegationId,
        operation: command.operation,
      },
      artifactId,
      this.prisma,
      false,
    );
    const references = (value: unknown): boolean => {
      if (!value || typeof value !== 'object') return false;
      if (Array.isArray(value)) return value.some(references);
      const record = value as Record<string, unknown>;
      if (
        (record['artifactId'] === file.id && record['sha256'] === file.sha256) ||
        (record['documentArtifactId'] === file.id && record['documentSha256'] === file.sha256)
      )
        return true;
      return Object.values(record).some(references);
    };
    if (!file.ready || !references(command.reviewedArguments ?? command.arguments))
      throw new ForbiddenException('O arquivo não está vinculado à proposta.');
    return { bytes: await this.completeBytes(file), ...this.reference(file) };
  }

  async cleanup(): Promise<void> {
    const now = new Date();
    const expired = await this.prisma.mcpAdminFileArtifact.findMany({
      where: { OR: [{ expiresAt: { lte: now } }, { delegation: { revokedAt: { not: null } } }] },
      select: { id: true },
      take: 50,
      orderBy: { expiresAt: 'asc' },
    });
    if (expired.length) {
      await this.prisma.mcpAdminFileArtifact.deleteMany({
        where: {
          id: { in: expired.map((file) => file.id) },
          OR: [{ expiresAt: { lte: now } }, { delegation: { revokedAt: { not: null } } }],
        },
      });
    }
  }
}
