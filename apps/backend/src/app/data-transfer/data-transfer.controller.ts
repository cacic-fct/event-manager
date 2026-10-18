import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type {
  TransferApplyRequest,
  TransferExportRequest,
  TransferPreviewRequest,
} from '@cacic-fct/shared-data-transfer';
import { Permission } from '@cacic-fct/shared-permissions';
import { AllowScopedCollectionPermissions } from '../auth/decorators/allow-scoped-collection-permissions.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { RequireCollectionPermissions } from '../auth/decorators/require-collection-permissions.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { DataTransferService } from './data-transfer.service';

const personDecisionsSchema: Extract<Parameters<typeof ApiBody>[0], { schema: unknown }>['schema'] = {
  type: 'array',
  description:
    'Explicit create/merge/skip choices for server-issued missing-person keys. Creation requires global people read/create permissions, a full name and another identifier. All identities are checked again before the atomic write.',
  items: {
    type: 'object',
    required: ['key', 'action'],
    additionalProperties: false,
    properties: {
      key: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      action: { type: 'string', enum: ['create', 'merge', 'skip'] },
      reviewHash: {
        type: 'string',
        pattern: '^[a-f0-9]{64}$',
        description: 'Fingerprint of the existing candidates explicitly reviewed by the organizer.',
      },
      personId: { type: 'string', description: 'Selected existing candidate for a manual merge.' },
      data: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', maxLength: 300 },
          academicId: { type: 'string', maxLength: 40 },
          identityDocument: { type: 'string', maxLength: 40 },
          email: { type: 'string', format: 'email', maxLength: 300 },
          phone: {
            type: 'string',
            maxLength: 40,
            description:
              'Complete phone number in E.164 format (country prefix), or a Brazilian local number with area code.',
          },
        },
      },
    },
    example: { key: '0'.repeat(64), action: 'create', data: { name: 'Ana Silva', email: 'ana@example.com' } },
  },
};

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

@ApiTags('admin-data-transfer')
@ApiBearerAuth()
@Controller('admin/data-transfer')
export class DataTransferController {
  constructor(private readonly transfer: DataTransferService) {}

  @Get('schema')
  @AllowScopedCollectionPermissions()
  @ApiOperation({ summary: 'Get the JSON Schema for event and sports configuration transfers' })
  @ApiOkResponse({ description: 'JSON Schema for the supported transfer document version.' })
  @ApiForbiddenResponse({ description: 'The authenticated user lacks data transfer export access.' })
  schema(@Req() request: AuthenticatedRequest) {
    return this.transfer.getSchema(request.user);
  }

  @Post('export')
  @RequirePermissions(Permission.DataTransfer.Export)
  @AllowScopedCollectionPermissions()
  @ApiOperation({ summary: 'Export an authorized event tree and optional configuration' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['target', 'includeDescendants', 'includeConfiguration'],
      properties: {
        target: {
          type: 'object',
          required: ['kind', 'id'],
          additionalProperties: false,
          properties: {
            kind: { type: 'string', enum: ['event', 'group', 'major-event'] },
            id: { type: 'string' },
          },
        },
        includeDescendants: { type: 'boolean' },
        includeConfiguration: { type: 'boolean' },
        includeSubscriptions: { type: 'boolean', default: false },
        includeAttendances: { type: 'boolean', default: false },
        includeTickets: { type: 'boolean', default: false },
        includeChildSubscriptions: { type: 'boolean', default: false },
        includeChildAttendances: { type: 'boolean', default: false },
      },
      additionalProperties: false,
    },
  })
  @ApiOkResponse({ description: 'Transfer document and any safe export omissions.' })
  @ApiForbiddenResponse({ description: 'The authenticated user lacks read permission for one or more resources.' })
  export(@Body() input: TransferExportRequest, @Req() request: AuthenticatedRequest) {
    return this.transfer.export(input, request.user);
  }

  @Post('preview')
  // Nested resource IDs can span scopes; the service gates the collection and authorizes each row.
  @RequireCollectionPermissions(Permission.DataTransfer.Import)
  @ApiOperation({ summary: 'Validate an import and return its authorized field-by-field plan' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['document'],
      properties: {
        document: { type: 'object' },
        personDecisions: personDecisionsSchema,
        scope: {
          type: 'object',
          required: ['kind', 'id'],
          additionalProperties: false,
          properties: {
            kind: { type: 'string', enum: ['event', 'group', 'major-event'] },
            id: { type: 'string' },
          },
        },
      },
      additionalProperties: false,
    },
  })
  @ApiOkResponse({ description: 'Preview rows, summary, and a fingerprint for the current target revisions.' })
  @ApiForbiddenResponse({ description: 'The authenticated user lacks transfer or resource permissions.' })
  preview(@Body() input: TransferPreviewRequest, @Req() request: AuthenticatedRequest) {
    return this.transfer.preview(input, request.user);
  }

  @Post('apply')
  // Keep the controller guard from binding the whole batch to the first nested resource ID.
  @RequireCollectionPermissions(Permission.DataTransfer.Import)
  @ApiOperation({ summary: 'Apply a previously reviewed transfer plan' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['document', 'planHash', 'allowPartial'],
      properties: {
        document: { type: 'object' },
        personDecisions: personDecisionsSchema,
        scope: {
          type: 'object',
          required: ['kind', 'id'],
          additionalProperties: false,
          properties: {
            kind: { type: 'string', enum: ['event', 'group', 'major-event'] },
            id: { type: 'string' },
          },
        },
        planHash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        allowPartial: { type: 'boolean' },
        allocationToken: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      },
      additionalProperties: false,
    },
  })
  @ApiOkResponse({ description: 'Per-resource results after the transaction commits.' })
  @ApiConflictResponse({ description: 'The preview is stale, rows are blocked, or target revisions changed.' })
  @ApiForbiddenResponse({ description: 'The authenticated user lacks transfer or resource permissions.' })
  apply(@Body() input: TransferApplyRequest, @Req() request: AuthenticatedRequest) {
    return this.transfer.apply(input, request.user);
  }

  @Get('history')
  @AllowScopedCollectionPermissions()
  @ApiOperation({ summary: 'List recent authorized JSON import batches from the audit log' })
  @ApiOkResponse({ description: 'Safe batch summaries; private backups are never returned.' })
  history(@Req() request: AuthenticatedRequest) {
    return this.transfer.history(request.user);
  }

  @Post('undo')
  @RequirePermissions(Permission.DataTransfer.Undo)
  @AllowScopedCollectionPermissions()
  @ApiOperation({ summary: 'Atomically undo an import after checking permissions and later modifications' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['batchId'],
      properties: { batchId: { type: 'string', format: 'uuid' } },
    },
  })
  @ApiConflictResponse({
    description: 'Later changes, schema drift, or an already reverted batch block the entire undo.',
  })
  undo(@Body() input: { batchId: string }, @Req() request: AuthenticatedRequest) {
    return this.transfer.undo(input.batchId, request.user);
  }
}
