import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import type { AdminMcpOperationInfo } from '@cacic-fct/event-manager-mcp-contracts';
import { Permission } from '@cacic-fct/shared-permissions';
import type {
  TransferApplyRequest,
  TransferExportRequest,
  TransferPreviewRequest,
} from '@cacic-fct/shared-data-transfer';
import { TRANSFER_MAX_BYTES } from '@cacic-fct/shared-data-transfer';
import type { SubscriberCsvField } from '@cacic-fct/shared-utils';
import { z } from 'zod';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { DataTransferService } from '../../data-transfer/data-transfer.service';
import type { UploadedEventFormImageFile } from '../../event-forms/event-form-image.utils';
import { MAX_EVENT_FORM_IMAGE_FILE_SIZE_BYTES } from '../../event-forms/event-form-image.utils';
import { EventFormImagesService } from '../../event-forms/event-form-images.service';
import { EventFormsService } from '../../event-forms/event-forms.service';
import {
  SubscriptionBadgeExportService,
  type SubscriberBadgeExportInput,
} from '../../events/subscription-badge-export.service';
import { SportsMutationEventsService } from '../../sports/realtime/sports-mutation-events.service';
import { SPORTS_TEAM_LOGO_POLICY } from '../../sports/logos/sports-team-logo.policy';
import { SportsTeamLogoService, type SportsTeamLogoUploadFile } from '../../sports/logos/sports-team-logo.service';
import type { Readable } from 'node:stream';
import { McpAdminFileArtifactService } from './artifact-files';
import type { AdminMcpOperation } from './catalog';
import { mcpUserId } from '../mcp-admin-principal';

const TRANSFER_MAX_INPUT_BYTES = TRANSFER_MAX_BYTES + 64 * 1024;
const TRANSFER_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const MAX_MCP_FILE_BYTES = 64 * 1024 * 1024;

type RestArguments = Record<string, unknown>;

export interface AdminMcpRestOperationContext {
  readonly delegationId: string;
  readonly clientId: string;
  readonly operation: string;
  readonly proposalId?: string;
}

export interface PreparedAdminRestOperation {
  readonly schema: z.ZodType;
  readonly maxInputBytes: number;
  readonly maxOutputBytes: number;
  readonly execute: (
    args: RestArguments,
    user: AuthenticatedUser,
    context: AdminMcpRestOperationContext,
  ) => Promise<unknown>;
  readonly preflight?: (
    args: RestArguments,
    user: AuthenticatedUser,
    context: AdminMcpRestOperationContext,
  ) => Promise<void>;
}

const targetSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('event'), id: z.string().min(1).max(200) }),
  z.strictObject({ kind: z.literal('group'), id: z.string().min(1).max(200) }),
  z.strictObject({ kind: z.literal('major-event'), id: z.string().min(1).max(200) }),
]);

const transferJson = z.custom<unknown>(isBoundedTransferJson, {
  message: 'O arquivo de transferência é inválido ou excessivo.',
});

const exportSchema = z.strictObject({
  target: targetSchema,
  includeDescendants: z.boolean(),
  includeConfiguration: z.boolean(),
  includeSubscriptions: z.boolean().optional(),
  includeAttendances: z.boolean().optional(),
  includeTickets: z.boolean().optional(),
  includePublishingState: z.boolean().optional(),
  includeAudienceInvitations: z.boolean().optional(),
  includeChildSubscriptions: z.boolean().optional(),
  includeChildAttendances: z.boolean().optional(),
});

const personDataSchema = z.strictObject({
  name: z.string().max(300).optional(),
  academicId: z.string().max(40).optional(),
  identityDocument: z.string().max(40).optional(),
  email: z.email().max(300).optional(),
  phone: z.string().max(40).optional(),
});

const personDecisionSchema = z.discriminatedUnion('action', [
  z.strictObject({ key: z.string().regex(/^[a-f0-9]{64}$/), action: z.literal('skip') }),
  z.strictObject({
    key: z.string().regex(/^[a-f0-9]{64}$/),
    action: z.literal('create'),
    data: personDataSchema,
    reviewHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  }),
  z.strictObject({
    key: z.string().regex(/^[a-f0-9]{64}$/),
    action: z.literal('merge'),
    personId: z.string().min(1).max(200),
    data: personDataSchema,
    reviewHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  }),
]);

const previewSchema = z
  .strictObject({
    document: transferJson.optional(),
    documentArtifactId: z.uuid().optional(),
    documentSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    scope: targetSchema.optional(),
    personDecisions: z.array(personDecisionSchema).max(500).optional(),
  })
  .superRefine(requireTransferDocument);

const applySchema = z
  .strictObject({
    document: transferJson.optional(),
    documentArtifactId: z.uuid().optional(),
    documentSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    scope: targetSchema.optional(),
    personDecisions: z.array(personDecisionSchema).max(500).optional(),
    planHash: z.string().regex(/^[a-f0-9]{64}$/),
    allowPartial: z.boolean(),
    allocationToken: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .superRefine(requireTransferDocument);

const historySchema = z.strictObject({});
const undoSchema = z.strictObject({ batchId: z.string().uuid() });
const emptySchema = z.strictObject({});
const fileNameSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => !/[\\/]/.test(value) && ![...value].some((character) => character.charCodeAt(0) < 32));
const artifactFields = {
  artifactId: z.uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  fileName: fileNameSchema,
  contentType: z.string().min(3).max(100),
};

const sportsTeamLogoMimeType = z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']);
const formImageMimeType = z.enum([
  'image/avif',
  'image/bmp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/tiff',
  'image/webp',
]);

const uploadSportsTeamLogoSchema = z.strictObject({
  sportsTeamId: z.string().min(1).max(200),
  expectedRevision: z.number().int().min(1),
  ...artifactFields,
  contentType: sportsTeamLogoMimeType,
});
const downloadSportsTeamLogoSchema = z.strictObject({
  sportsTeamId: z.string().min(1).max(200),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const uploadEventFormImageSchema = z.strictObject({
  formId: z.string().min(1).max(200),
  ...artifactFields,
  contentType: formImageMimeType,
});
const uploadPendingEventFormImageSchema = z
  .strictObject({
    ownerEventId: z.string().min(1).max(200).optional(),
    ownerMajorEventId: z.string().min(1).max(200).optional(),
    ...artifactFields,
    contentType: formImageMimeType,
  })
  .superRefine((value, context) => {
    if (value.ownerEventId && value.ownerMajorEventId) {
      context.addIssue({ code: 'custom', message: 'Informe somente um alvo proprietário.' });
    }
  });
const deleteEventFormImageSchema = z.strictObject({
  formId: z.string().min(1).max(200),
  imageId: z.string().min(1).max(200),
});
const downloadEventFormImageSchema = z.strictObject({
  formId: z.string().min(1).max(200),
  imageId: z.string().min(1).max(200),
});
const downloadEventFormImageByIdSchema = z.strictObject({ imageId: z.string().min(1).max(200) });
const exportEventFormResultsCsvSchema = z.strictObject({ formId: z.string().min(1).max(200) });
const badgeOptionsSchema = z.strictObject({
  fields: z
    .array(z.enum(['fullName', 'email', 'identityDocument', 'enrollmentNumber', 'unespRole', 'phone']))
    .min(1)
    .max(6),
  identityDocumentMode: z.enum(['masked', 'complete']),
  errorCorrectionLevel: z.string().regex(/^(?:[5-9]|[1-8][0-9]|9[0-5])$/),
  format: z.enum(['svg', 'png']),
  fileName: z.enum(['id', 'fullName', 'identityDocument']),
});
const exportEventSubscriptionBadgesSchema = z.strictObject({
  eventId: z.string().min(1).max(200),
  ...badgeOptionsSchema.shape,
});
const exportMajorEventSubscriptionBadgesSchema = z.strictObject({
  majorEventId: z.string().min(1).max(200),
  ...badgeOptionsSchema.shape,
});

function isBoundedTransferJson(value: unknown): boolean {
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(value);
  } catch {
    return false;
  }
  if (encoded === undefined || Buffer.byteLength(encoded) > TRANSFER_MAX_BYTES) return false;

  let entries = 0;
  const inspect = (item: unknown, depth: number): boolean => {
    if (depth > 32 || ++entries > 100_000) return false;
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (Array.isArray(item)) return item.length <= 5_000 && item.every((child) => inspect(child, depth + 1));
    if (typeof item !== 'object') return false;
    const pairs = Object.entries(item);
    return (
      pairs.length <= 5_000 &&
      pairs.every(
        ([key, child]) => !['__proto__', 'prototype', 'constructor'].includes(key) && inspect(child, depth + 1),
      )
    );
  };
  return inspect(value, 0);
}

function requireTransferDocument(
  value: { document?: unknown; documentArtifactId?: string; documentSha256?: string },
  context: z.RefinementCtx,
): void {
  const hasInlineDocument = value.document !== undefined;
  const hasArtifact = value.documentArtifactId !== undefined;
  if (hasInlineDocument === hasArtifact || hasArtifact !== (value.documentSha256 !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Informe um arquivo de transferência ou uma referência completa.' });
  }
}

function assertOutputBound(value: unknown): void {
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new BadRequestException('O resultado da operação não pôde ser serializado.');
  }
  if (encoded === undefined || Buffer.byteLength(encoded) > TRANSFER_MAX_OUTPUT_BYTES) {
    throw new BadRequestException('Resultado excessivo. Reduza o arquivo ou consulte um recurso específico.');
  }
}

@Injectable()
export class AdminMcpRestOperations {
  private readonly operations: ReadonlyMap<string, PreparedAdminRestOperation>;

  constructor(
    private readonly transfer: DataTransferService,
    @Optional() private readonly artifacts?: McpAdminFileArtifactService,
    @Optional() private readonly authorization?: AuthorizationPolicyService,
    @Optional() private readonly teamLogos?: SportsTeamLogoService,
    @Optional() private readonly sportsMutationEvents?: SportsMutationEventsService,
    @Optional() private readonly formImages?: EventFormImagesService,
    @Optional() private readonly forms?: EventFormsService,
    @Optional() private readonly badgeExports?: SubscriptionBadgeExportService,
  ) {
    this.operations = new Map([
      [
        'dataTransferSchema',
        {
          schema: emptySchema,
          maxInputBytes: 64_000,
          maxOutputBytes: TRANSFER_MAX_OUTPUT_BYTES,
          execute: async (_args, user) => this.transfer.getSchema(user),
        },
      ],
      [
        'exportDataTransfer',
        {
          schema: exportSchema,
          maxInputBytes: 64_000,
          maxOutputBytes: TRANSFER_MAX_OUTPUT_BYTES,
          execute: async (args, user, context) => {
            const input = args as unknown as TransferExportRequest;
            const exported = await this.transfer.export(input, user);
            const target: Record<string, string> = {};
            if (input.target.kind === 'event') target['eventId'] = input.target.id;
            else if (input.target.kind === 'group') target['eventGroupId'] = input.target.id;
            else target['majorEventId'] = input.target.id;
            const bytes = Buffer.from(JSON.stringify(exported.document));
            const file = await this.createExport(
              context,
              user,
              target,
              `event-data-export-${input.target.kind}.json`,
              'application/json',
              bytes,
            );
            return { ...file, issues: exported.issues };
          },
        },
      ],
      [
        'previewDataTransfer',
        {
          schema: previewSchema,
          maxInputBytes: TRANSFER_MAX_INPUT_BYTES,
          maxOutputBytes: TRANSFER_MAX_OUTPUT_BYTES,
          execute: async (args, user, context) =>
            this.transfer.preview(
              (await this.withTransferDocument(args, user, context)) as unknown as TransferPreviewRequest,
              user,
            ),
        },
      ],
      [
        'dataTransferHistory',
        {
          schema: historySchema,
          maxInputBytes: 64_000,
          maxOutputBytes: TRANSFER_MAX_OUTPUT_BYTES,
          execute: async (_args, user) => this.transfer.history(user),
        },
      ],
      [
        'applyDataTransfer',
        {
          schema: applySchema,
          maxInputBytes: TRANSFER_MAX_INPUT_BYTES,
          maxOutputBytes: TRANSFER_MAX_OUTPUT_BYTES,
          execute: async (args, user, context) =>
            this.transfer.apply(
              (await this.withTransferDocument(args, user, context)) as unknown as TransferApplyRequest,
              user,
            ),
          preflight: async (args, user, context) => {
            await this.transfer.validateReviewedApply(
              (await this.withTransferDocument(args, user, context)) as unknown as TransferApplyRequest,
              user,
            );
          },
        },
      ],
      [
        'undoDataTransfer',
        {
          schema: undoSchema,
          maxInputBytes: 64_000,
          maxOutputBytes: TRANSFER_MAX_OUTPUT_BYTES,
          execute: async (args, user) => this.transfer.undo(String(args['batchId']), user),
          preflight: async (args, user) => {
            await this.transfer.validateUndo(String(args['batchId']), user);
          },
        },
      ],
      [
        'uploadSportsTeamLogo',
        {
          schema: uploadSportsTeamLogoSchema,
          maxInputBytes: 64_000,
          maxOutputBytes: 64_000,
          preflight: async (args, user, context) => {
            const sportsTeamId = String(args['sportsTeamId']);
            await this.policy().assertPermissions(user, [Permission.SportsTeam.Update], { sportsTeamId });
            const buffer = await this.loadUpload(args, user, context, { sportsTeamId });
            this.assertUploadSize(buffer, SPORTS_TEAM_LOGO_POLICY.maximumUploadBytes);
          },
          execute: async (args, user, context) => {
            const sportsTeamId = String(args['sportsTeamId']);
            const buffer = await this.loadUpload(args, user, context, { sportsTeamId });
            this.assertUploadSize(buffer, SPORTS_TEAM_LOGO_POLICY.maximumUploadBytes);
            await this.policy().assertPermissions(user, [Permission.SportsTeam.Update], { sportsTeamId });
            const file: SportsTeamLogoUploadFile = {
              buffer,
              mimetype: String(args['contentType']),
              originalname: String(args['fileName']),
              size: buffer.length,
            };
            const record = await this.requireService(this.teamLogos, 'Logo de equipe').upload(
              sportsTeamId,
              Number(args['expectedRevision']),
              file,
              user,
            );
            try {
              await this.sportsMutationEvents?.publishForEntity('TEAM', sportsTeamId, true);
            } catch {
              // The logo and its audit record are committed; event invalidation is best effort like the REST controller.
            }
            return {
              teamId: record.teamId,
              revision: record.revision,
              sha256: record.sha256,
              mimeType: record.mimeType,
              sizeBytes: record.sizeBytes,
              width: record.width,
              height: record.height,
            };
          },
        },
      ],
      [
        'downloadSportsTeamLogo',
        {
          schema: downloadSportsTeamLogoSchema,
          maxInputBytes: 64_000,
          maxOutputBytes: 64_000,
          execute: async (args, user, context) => {
            const sportsTeamId = String(args['sportsTeamId']);
            const sha256 = String(args['sha256']);
            await this.policy().assertPermissions(user, [Permission.SportsTeam.Read], { sportsTeamId });
            const image = await this.requireService(this.teamLogos, 'Logo de equipe').download(sportsTeamId, sha256);
            const bytes = await readBounded(image.stream, SPORTS_TEAM_LOGO_POLICY.maximumUploadBytes);
            return this.createExport(
              context,
              user,
              { sportsTeamId, sha256 },
              `equipe-${sportsTeamId}.avif`,
              image.mimeType,
              bytes,
            );
          },
        },
      ],
      [
        'uploadEventFormImage',
        {
          schema: uploadEventFormImageSchema,
          maxInputBytes: 64_000,
          maxOutputBytes: 64_000,
          preflight: async (args, user, context) => {
            const formId = String(args['formId']);
            await this.policy().assertPermissions(user, [Permission.EventForm.Update], { eventFormId: formId });
            const buffer = await this.loadUpload(args, user, context, { formId });
            this.assertUploadSize(buffer, MAX_EVENT_FORM_IMAGE_FILE_SIZE_BYTES);
          },
          execute: async (args, user, context) => {
            const formId = String(args['formId']);
            const buffer = await this.loadUpload(args, user, context, { formId });
            this.assertUploadSize(buffer, MAX_EVENT_FORM_IMAGE_FILE_SIZE_BYTES);
            const image = await this.requireService(this.formImages, 'Imagens de formulário').upload(
              formId,
              this.formImageFile(args, buffer),
              user,
            );
            return { id: image.id, width: image.width, height: image.height };
          },
        },
      ],
      [
        'uploadPendingEventFormImage',
        {
          schema: uploadPendingEventFormImageSchema,
          maxInputBytes: 64_000,
          maxOutputBytes: 64_000,
          preflight: async (args, user, context) => {
            const target = this.pendingImageTarget(args);
            await this.policy().assertPermissions(user, [Permission.EventForm.Create], {
              ...(target.ownerEventId ? { eventId: target.ownerEventId } : {}),
              ...(target.ownerMajorEventId ? { majorEventId: target.ownerMajorEventId } : {}),
              allowScopedCollection: true,
            });
            const buffer = await this.loadUpload(args, user, context, target);
            this.assertUploadSize(buffer, MAX_EVENT_FORM_IMAGE_FILE_SIZE_BYTES);
          },
          execute: async (args, user, context) => {
            const target = this.pendingImageTarget(args);
            const buffer = await this.loadUpload(args, user, context, target);
            this.assertUploadSize(buffer, MAX_EVENT_FORM_IMAGE_FILE_SIZE_BYTES);
            const image = await this.requireService(this.formImages, 'Imagens de formulário').uploadPending(
              this.formImageFile(args, buffer),
              user,
              target,
            );
            return { id: image.id, width: image.width, height: image.height };
          },
        },
      ],
      [
        'deleteEventFormImage',
        {
          schema: deleteEventFormImageSchema,
          maxInputBytes: 64_000,
          maxOutputBytes: 64_000,
          execute: async (args, user) => {
            const formId = String(args['formId']);
            const imageId = String(args['imageId']);
            await this.requireService(this.formImages, 'Imagens de formulário').delete(formId, imageId, user);
            return { formId, imageId, deleted: true };
          },
        },
      ],
      [
        'downloadEventFormImage',
        {
          schema: downloadEventFormImageSchema,
          maxInputBytes: 64_000,
          maxOutputBytes: 64_000,
          execute: async (args, user, context) => {
            const formId = String(args['formId']);
            const imageId = String(args['imageId']);
            const image = await this.requireService(this.formImages, 'Imagens de formulário').download(
              formId,
              imageId,
              user,
            );
            const bytes = await readBounded(image.stream, MAX_EVENT_FORM_IMAGE_FILE_SIZE_BYTES);
            return this.createExport(
              context,
              user,
              { formId, imageId },
              `formulario-${formId}-imagem-${imageId}.avif`,
              image.contentType,
              bytes,
            );
          },
        },
      ],
      [
        'downloadEventFormImageById',
        {
          schema: downloadEventFormImageByIdSchema,
          maxInputBytes: 64_000,
          maxOutputBytes: 64_000,
          execute: async (args, user, context) => {
            const imageId = String(args['imageId']);
            const image = await this.requireService(this.formImages, 'Imagens de formulário').downloadById(
              imageId,
              user,
            );
            const bytes = await readBounded(image.stream, MAX_EVENT_FORM_IMAGE_FILE_SIZE_BYTES);
            return this.createExport(
              context,
              user,
              { imageId },
              `formulario-imagem-${imageId}.avif`,
              image.contentType,
              bytes,
            );
          },
        },
      ],
      [
        'exportEventFormResultsCsv',
        {
          schema: exportEventFormResultsCsvSchema,
          maxInputBytes: 64_000,
          maxOutputBytes: 64_000,
          execute: async (args, user, context) => {
            const formId = String(args['formId']);
            const stream = await this.requireService(this.forms, 'Formulários').streamAdminResultsCsv(user, formId);
            const bytes = await readBounded(stream, MAX_MCP_FILE_BYTES);
            return this.createExport(context, user, { formId }, `form-results-${formId}.csv`, 'text/csv', bytes);
          },
        },
      ],
      [
        'exportEventSubscriptionBadgesZip',
        {
          schema: exportEventSubscriptionBadgesSchema,
          maxInputBytes: 64_000,
          maxOutputBytes: 64_000,
          execute: async (args, user, context) => {
            const eventId = String(args['eventId']);
            await this.policy().assertPermissions(
              user,
              [Permission.Subscription.Read, Permission.Event.Read, Permission.MajorEvent.Read],
              { eventId },
            );
            const exported = await this.requireService(this.badgeExports, 'Exportações de inscrição').exportEvent(
              eventId,
              this.badgeInput(args),
            );
            const bytes = await readBounded(exported.file.getStream(), MAX_MCP_FILE_BYTES);
            return this.createExport(context, user, { eventId }, exported.fileName, 'application/zip', bytes);
          },
        },
      ],
      [
        'exportMajorEventSubscriptionBadgesZip',
        {
          schema: exportMajorEventSubscriptionBadgesSchema,
          maxInputBytes: 64_000,
          maxOutputBytes: 64_000,
          execute: async (args, user, context) => {
            const majorEventId = String(args['majorEventId']);
            await this.policy().assertPermissions(user, [Permission.Subscription.Read, Permission.MajorEvent.Read], {
              majorEventId,
            });
            const exported = await this.requireService(this.badgeExports, 'Exportações de inscrição').exportMajorEvent(
              majorEventId,
              this.badgeInput(args),
            );
            const bytes = await readBounded(exported.file.getStream(), MAX_MCP_FILE_BYTES);
            return this.createExport(context, user, { majorEventId }, exported.fileName, 'application/zip', bytes);
          },
        },
      ],
    ]);
  }

  fields(): string[] {
    return [...this.operations.keys()];
  }

  prepare(definition: AdminMcpOperation): { operation: PreparedAdminRestOperation; info: AdminMcpOperationInfo } {
    const operation = this.operations.get(definition.field);
    if (!operation) throw new Error('Operação REST sem adaptador tipado.');
    if (definition.transport !== 'REST') throw new Error('Operação REST sem classificação explícita.');
    const info: AdminMcpOperationInfo = {
      field: definition.field,
      kind: definition.kind,
      domain: definition.domain,
      personalData: definition.personalData,
      requiresAllAuthorized: definition.target === 'GLOBAL' || definition.target.mode !== 'ARGUMENTS',
      tool: `${definition.kind === 'mutation' ? 'propose_admin' : 'admin'}_${definition.field}`,
      label: operationLabel(definition.field),
      description: definition.description,
      inputSchema: z.toJSONSchema(operation.schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>,
    };
    return { operation, info };
  }

  operation(field: string): PreparedAdminRestOperation | undefined {
    return this.operations.get(field);
  }

  async execute(
    field: string,
    args: RestArguments,
    user: AuthenticatedUser,
    context: AdminMcpRestOperationContext,
  ): Promise<unknown> {
    const operation = this.operations.get(field);
    if (!operation) throw new BadRequestException('Operação administrativa indisponível.');
    const result = await operation.execute(args, user, context);
    assertOutputBound(result);
    return result;
  }

  async preflight(
    field: string,
    args: RestArguments,
    user: AuthenticatedUser,
    context: AdminMcpRestOperationContext,
  ): Promise<void> {
    const operation = this.operations.get(field);
    if (!operation) throw new BadRequestException('Operação administrativa indisponível.');
    await operation.preflight?.(args, user, context);
  }

  private async withTransferDocument(
    args: RestArguments,
    user: AuthenticatedUser,
    context: AdminMcpRestOperationContext,
  ): Promise<RestArguments> {
    if (args['document'] !== undefined) return args;
    if (!this.artifacts || typeof args['documentArtifactId'] !== 'string' || typeof args['documentSha256'] !== 'string')
      throw new BadRequestException('O arquivo administrativo está indisponível.');
    const documentBytes = await this.artifacts.loadUpload({
      userId: mcpUserId(user),
      clientId: context.clientId,
      delegationId: context.delegationId,
      operation: context.operation,
      artifactId: args['documentArtifactId'],
      expectedSha256: args['documentSha256'],
      target: {},
    });
    let document: unknown;
    try {
      document = JSON.parse(documentBytes.toString('utf8')) as unknown;
    } catch {
      throw new BadRequestException('O arquivo de transferência não contém JSON válido.');
    }
    if (!isBoundedTransferJson(document)) throw new BadRequestException('O arquivo de transferência é excessivo.');
    const resolved = { ...args };
    delete resolved['documentArtifactId'];
    delete resolved['documentSha256'];
    resolved['document'] = document;
    return resolved;
  }

  private async loadUpload(
    args: RestArguments,
    user: AuthenticatedUser,
    context: AdminMcpRestOperationContext,
    target: Record<string, string>,
  ): Promise<Buffer> {
    if (!this.artifacts || typeof args['artifactId'] !== 'string' || typeof args['sha256'] !== 'string') {
      throw new BadRequestException('O arquivo administrativo está indisponível.');
    }
    return this.artifacts.loadUpload({
      userId: mcpUserId(user),
      clientId: context.clientId,
      delegationId: context.delegationId,
      operation: context.operation,
      artifactId: args['artifactId'],
      expectedSha256: args['sha256'],
      target,
    });
  }

  private formImageFile(args: RestArguments, buffer: Buffer): UploadedEventFormImageFile {
    return {
      buffer,
      mimetype: String(args['contentType']),
      originalname: String(args['fileName']),
      size: buffer.length,
    };
  }

  private pendingImageTarget(args: RestArguments): { ownerEventId?: string; ownerMajorEventId?: string } {
    const target: { ownerEventId?: string; ownerMajorEventId?: string } = {};
    if (typeof args['ownerEventId'] === 'string') target.ownerEventId = args['ownerEventId'];
    if (typeof args['ownerMajorEventId'] === 'string') target.ownerMajorEventId = args['ownerMajorEventId'];
    return target;
  }

  private badgeInput(args: RestArguments): SubscriberBadgeExportInput {
    return {
      fields: args['fields'] as SubscriberCsvField[],
      identityDocumentMode: args['identityDocumentMode'] as SubscriberBadgeExportInput['identityDocumentMode'],
      errorCorrectionLevel: String(args['errorCorrectionLevel']),
      format: args['format'] as SubscriberBadgeExportInput['format'],
      fileName: args['fileName'] as SubscriberBadgeExportInput['fileName'],
    };
  }

  private assertUploadSize(buffer: Buffer, maximumBytes: number): void {
    if (buffer.length === 0 || buffer.length > maximumBytes) {
      throw new BadRequestException('O arquivo excede o limite ou está vazio.');
    }
  }

  private async createExport(
    context: AdminMcpRestOperationContext,
    user: AuthenticatedUser,
    target: Record<string, string>,
    fileName: string,
    contentType: string,
    bytes: Buffer,
  ) {
    if (bytes.length > MAX_MCP_FILE_BYTES) {
      throw new BadRequestException('O arquivo excede o limite de exportação administrativa.');
    }
    return this.requireService(this.artifacts, 'Arquivos MCP').createExport({
      userId: mcpUserId(user),
      clientId: context.clientId,
      delegationId: context.delegationId,
      operation: context.operation,
      target,
      fileName,
      contentType,
      bytes,
    });
  }

  private policy(): AuthorizationPolicyService {
    return this.requireService(this.authorization, 'Autorização administrativa');
  }

  private requireService<T>(service: T | undefined, name: string): T {
    if (!service) throw new BadRequestException(`${name} indisponível.`);
    return service;
  }
}

export const REST_ADMIN_OPERATION_FIELDS = [
  'dataTransferSchema',
  'exportDataTransfer',
  'previewDataTransfer',
  'dataTransferHistory',
  'applyDataTransfer',
  'undoDataTransfer',
  'uploadSportsTeamLogo',
  'downloadSportsTeamLogo',
  'uploadEventFormImage',
  'uploadPendingEventFormImage',
  'deleteEventFormImage',
  'downloadEventFormImage',
  'downloadEventFormImageById',
  'exportEventFormResultsCsv',
  'exportEventSubscriptionBadgesZip',
  'exportMajorEventSubscriptionBadgesZip',
] as const;

function operationLabel(field: string): string {
  const labels: Readonly<Record<string, string>> = {
    dataTransferSchema: 'Consultar schema de transferência de dados',
    exportDataTransfer: 'Exportar dados de evento',
    previewDataTransfer: 'Pré-visualizar importação de dados',
    dataTransferHistory: 'Consultar histórico de importações',
    applyDataTransfer: 'Aplicar importação de dados',
    undoDataTransfer: 'Desfazer importação de dados',
    uploadSportsTeamLogo: 'Enviar logo de equipe esportiva',
    downloadSportsTeamLogo: 'Baixar logo de equipe esportiva',
    uploadEventFormImage: 'Enviar imagem para formulário',
    uploadPendingEventFormImage: 'Enviar imagem provisória para formulário',
    deleteEventFormImage: 'Excluir imagem de formulário',
    downloadEventFormImage: 'Baixar imagem de formulário',
    downloadEventFormImageById: 'Baixar imagem de formulário por identificador',
    exportEventFormResultsCsv: 'Exportar resultados do formulário em CSV',
    exportEventSubscriptionBadgesZip: 'Exportar crachás de inscrições do evento',
    exportMajorEventSubscriptionBadgesZip: 'Exportar crachás de inscrições do grande evento',
  };
  return labels[field] ?? field;
}

async function readBounded(stream: Readable, maximumBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      totalBytes += buffer.length;
      if (totalBytes > maximumBytes) {
        stream.destroy();
        throw new BadRequestException('O arquivo excede o limite de exportação administrativa.');
      }
      chunks.push(buffer);
    }
  } catch (error: unknown) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('O arquivo não pôde ser disponibilizado.');
  }
  return Buffer.concat(chunks, totalBytes);
}
