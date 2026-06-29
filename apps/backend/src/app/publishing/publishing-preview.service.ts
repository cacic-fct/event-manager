import { createHash, createHmac, randomBytes } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogOperation, PublicContentPreviewTargetType } from '@prisma/client';
import Redis from 'ioredis';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { GraphqlContext } from '../current-user/selects';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertPublicationTargetPermission,
  getPublicationUser,
  readPublicationPermission,
  resolvePublicationActorId,
  resolvePublicationActorName,
} from './publishing-auth';
import { PREVIEW_TOKEN_SECRET, PREVIEW_TRIM_DAYS, PREVIEW_TTL_SECONDS } from './publishing.constants';
import { PublicationPreviewContentService } from './publishing-preview-content.service';
import {
  PublicContentPreviewInput,
  PublicContentPreviewPayload,
  PublicContentPreviewResult,
} from './publishing.models';
import { previewPath, previewRedisKey, publicUrl } from './publishing-preview-url';
import { addDays, addSeconds } from 'date-fns';

@Injectable()
export class PublicationPreviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
    private readonly previewContent: PublicationPreviewContentService,
    private readonly redis: Redis,
  ) {}

  async createPreview(
    input: PublicContentPreviewInput,
    context: GraphqlContext,
  ): Promise<PublicContentPreviewResult> {
    const user = getPublicationUser(context);
    await assertPublicationTargetPermission(
      this.authorizationPolicy,
      user,
      input.targetType,
      input.targetId,
      readPublicationPermission(input.targetType),
    );

    const directUrl = await this.previewContent.resolveDirectPublishedUrl(input);
    if (directUrl) {
      return {
        url: directUrl,
        directPublicUrl: true,
        expiresAt: null,
        message: 'Este conteúdo já está publicado e sem alterações salvas depois da publicação.',
      };
    }

    const target = await this.previewContent.resolvePreviewTarget(input.targetType, input.targetId);
    const actorId = resolvePublicationActorId(user);
    const now = new Date();
    const expiresAt = addSeconds(now, PREVIEW_TTL_SECONDS);
    const trimAfter = addDays(now, PREVIEW_TRIM_DAYS);
    const previewToken = this.buildPreviewToken(
      input.targetType as PublicContentPreviewTargetType,
      input.targetId,
      actorId,
    );
    const previewTokenHash = this.hashPreviewToken(previewToken);
    const redisKey = previewRedisKey(previewTokenHash);
    const persistedPublicPath = previewPath(input.targetType, previewTokenHash);
    const publicPath = previewPath(input.targetType, previewToken);
    const previewAt = input.previewAt ?? now;

    const preview = await this.prisma.publicContentPreview.upsert({
      where: {
        targetType_targetId_createdById: {
          targetType: input.targetType as PublicContentPreviewTargetType,
          targetId: input.targetId,
          createdById: actorId,
        },
      },
      create: {
        previewTokenHash,
        targetType: input.targetType as PublicContentPreviewTargetType,
        targetId: input.targetId,
        targetLabel: target.label,
        previewAt,
        publicPath: persistedPublicPath,
        redisKey,
        createdById: actorId,
        createdByName: resolvePublicationActorName(user),
        createdByEmail: user?.email ?? null,
        expiresAt,
        trimAfter,
      },
      update: {
        targetLabel: target.label,
        previewAt,
        publicPath: persistedPublicPath,
        redisKey,
        createdByName: resolvePublicationActorName(user),
        createdByEmail: user?.email ?? null,
        expiresAt,
        trimAfter,
        lastUsedAt: now,
      },
    });

    await this.storePreviewSession(input, actorId, redisKey, previewAt);
    await this.auditLog.record({
      entityType: target.auditType,
      entityId: input.targetId,
      entityLabel: target.label,
      operation: AuditLogOperation.CREATE,
      actor: user,
      summary: 'Pré-visualização criada.',
      metadata: {
        previewId: preview.id,
        previewPath: preview.publicPath,
        expiresAt: expiresAt.toISOString(),
        previewAt: previewAt.toISOString(),
      },
      force: true,
      squashWindowMs: 0,
    });

    return {
      url: publicUrl(publicPath),
      directPublicUrl: false,
      expiresAt,
      message: 'Link temporário criado. Ele expira em 1 hora.',
    };
  }

  async getPreviewPayload(previewToken: string): Promise<PublicContentPreviewPayload> {
    const preview = await this.prisma.publicContentPreview.findUnique({
      where: { previewTokenHash: this.hashPreviewToken(previewToken) },
    });

    if (!preview || preview.expiresAt <= new Date()) {
      throw new NotFoundException('Preview expired or not found.');
    }

    const redisPayload = await this.redis.get(preview.redisKey);
    if (!redisPayload) {
      throw new NotFoundException('Preview expired or not found.');
    }

    await this.prisma.publicContentPreview.update({
      where: { id: preview.id },
      data: { lastUsedAt: new Date() },
    });

    return this.previewContent.loadPreviewPayload({
      targetType: preview.targetType,
      targetId: preview.targetId,
      previewAt: preview.previewAt ?? preview.createdAt,
      expiresAt: preview.expiresAt,
    });
  }

  private buildPreviewToken(
    targetType: PublicContentPreviewTargetType,
    targetId: string,
    actorId: string,
  ): string {
    return createHmac('sha256', PREVIEW_TOKEN_SECRET)
      .update(targetType)
      .update('\0')
      .update(targetId)
      .update('\0')
      .update(actorId)
      .update('\0')
      .update(randomBytes(32))
      .digest('base64url');
  }

  private hashPreviewToken(previewToken: string): string {
    return createHash('sha256').update(previewToken).digest('hex');
  }

  private async storePreviewSession(
    input: PublicContentPreviewInput,
    actorId: string,
    redisKey: string,
    previewAt: Date,
  ): Promise<void> {
    await this.redis.set(
      redisKey,
      JSON.stringify({
        targetType: input.targetType,
        targetId: input.targetId,
        createdById: actorId,
        previewAt: previewAt.toISOString(),
      }),
      'EX',
      PREVIEW_TTL_SECONDS,
    );
  }
}
