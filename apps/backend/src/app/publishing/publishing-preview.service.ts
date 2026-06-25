import { randomBytes } from 'crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogOperation, PublicContentPreviewTargetType } from '@prisma/client';
import { PublicationTargetType } from '@cacic-fct/shared-data-types';
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
import { PREVIEW_TRIM_DAYS, PREVIEW_TTL_SECONDS } from './publishing.constants';
import { PublicationPreviewContentService } from './publishing-preview-content.service';
import {
  PublicContentPreviewInput,
  PublicContentPreviewPayload,
  PublicContentPreviewResult,
} from './publishing.models';
import { previewPath, previewRedisKey, publicUrl } from './publishing-preview-url';

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
    const expiresAt = new Date(now.getTime() + PREVIEW_TTL_SECONDS * 1000);
    const trimAfter = new Date(now.getTime() + PREVIEW_TRIM_DAYS * 24 * 60 * 60 * 1000);
    const previewToken = await this.findOrCreatePreviewToken(
      input.targetType as PublicContentPreviewTargetType,
      input.targetId,
      actorId,
    );
    const redisKey = previewRedisKey(previewToken);
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
        previewToken,
        targetType: input.targetType as PublicContentPreviewTargetType,
        targetId: input.targetId,
        targetLabel: target.label,
        previewAt,
        publicPath,
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
        publicPath,
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
        previewPath: publicPath,
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

  async getPreviewPayload(previewToken: string, context: GraphqlContext): Promise<PublicContentPreviewPayload> {
    const user = getPublicationUser(context);
    const actorId = resolvePublicationActorId(user);
    const preview = await this.prisma.publicContentPreview.findUnique({
      where: { previewToken },
    });

    if (!preview || preview.expiresAt <= new Date()) {
      throw new NotFoundException('Preview expired or not found.');
    }

    if (preview.createdById !== actorId) {
      throw new ForbiddenException('This preview link belongs to another administrator.');
    }

    const redisPayload = await this.redis.get(preview.redisKey);
    if (!redisPayload) {
      throw new NotFoundException('Preview expired or not found.');
    }

    await assertPublicationTargetPermission(
      this.authorizationPolicy,
      user,
      preview.targetType as PublicationTargetType,
      preview.targetId,
      readPublicationPermission(preview.targetType as PublicationTargetType),
    );
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

  private async findOrCreatePreviewToken(
    targetType: PublicContentPreviewTargetType,
    targetId: string,
    actorId: string,
  ): Promise<string> {
    const existing = await this.prisma.publicContentPreview.findUnique({
      where: {
        targetType_targetId_createdById: {
          targetType,
          targetId,
          createdById: actorId,
        },
      },
    });
    return existing?.previewToken ?? randomBytes(24).toString('base64url');
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
