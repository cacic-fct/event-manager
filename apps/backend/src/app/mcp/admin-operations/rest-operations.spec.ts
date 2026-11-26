import { BadRequestException, ForbiddenException, StreamableFile } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { Readable } from 'node:stream';
import { DataTransferService } from '../../data-transfer/data-transfer.service';
import { EventFormImagesService } from '../../event-forms/event-form-images.service';
import { EventFormsService } from '../../event-forms/event-forms.service';
import { SubscriptionBadgeExportService } from '../../events/subscription-badge-export.service';
import { SportsMutationEventsService } from '../../sports/realtime/sports-mutation-events.service';
import { SPORTS_TEAM_LOGO_POLICY } from '../../sports/logos/sports-team-logo.policy';
import { SportsTeamLogoService } from '../../sports/logos/sports-team-logo.service';
import { McpAdminFileArtifactService } from './artifact-files';
import { AdminMcpRestOperations, REST_ADMIN_OPERATION_FIELDS } from './rest-operations';

const { jest } = import.meta;

function actor() {
  return {
    sub: 'organizer-1',
    claims: { azp: 'admin-mcp-client' },
    roles: ['access'],
    roleSet: new Set(['access']),
    permissions: [],
    permissionSet: new Set<string>(),
    scopes: [],
    scopeSet: new Set<string>(),
    oidcScopes: [],
    oidcScopeSet: new Set<string>(),
  } as never;
}

const execution = (operation: string) => ({
  delegationId: 'delegation-1',
  clientId: 'admin-mcp-client',
  operation,
});

function setup() {
  const transfer = {
    getSchema: jest.fn(async () => ({ format: 'cacic-event-data', version: 1 })),
    export: jest.fn(async () => ({
      document: { resources: [{ kind: 'event', id: 'event-1', data: { name: 'Evento' } }] },
      issues: [],
    })),
    preview: jest.fn(async () => ({ items: [], summary: {}, planHash: '1'.repeat(64), canApply: true })),
    history: jest.fn(async () => []),
    apply: jest.fn(async () => ({ applied: true })),
    validateReviewedApply: jest.fn(async () => undefined),
    undo: jest.fn(async () => ({ undone: true })),
    validateUndo: jest.fn(async () => undefined),
  };
  const artifacts = {
    loadUpload: jest.fn(async () => Buffer.from('{"format":"cacic-event-data","version":1,"resources":[]}')),
    createExport: jest.fn(async (input: Record<string, unknown>) => ({
      artifactId: 'artifact-1',
      fileName: input['fileName'],
      contentType: input['contentType'],
      sizeBytes: (input['bytes'] as Buffer).length,
      sha256: 'a'.repeat(64),
      expiresAt: new Date('2026-11-22T12:00:00Z'),
    })),
  };
  const authorization = { assertPermissions: jest.fn(async () => undefined) };
  const teamLogos = {
    upload: jest.fn(async () => ({
      teamId: 'team-1',
      revision: 3,
      sha256: 'b'.repeat(64),
      mimeType: 'image/avif',
      sizeBytes: 10,
      width: 20,
      height: 20,
      downloadUrl: '/private/signed-download',
    })),
    download: jest.fn(async () => ({
      stream: Readable.from([Buffer.from('logo')]),
      mimeType: 'image/avif',
      sizeBytes: 4,
      sha256: 'c'.repeat(64),
    })),
  };
  const sportsMutationEvents = { publishForEntity: jest.fn(async () => undefined) };
  const formImages = {
    upload: jest.fn(async () => ({ id: 'image-1', url: '/api/private-image', width: 32, height: 16 })),
    uploadPending: jest.fn(async () => ({ id: 'image-2', url: '/api/private-image', width: 32, height: 16 })),
    delete: jest.fn(async () => undefined),
    download: jest.fn(async () => ({ stream: Readable.from([Buffer.from('avif')]), contentType: 'image/avif' })),
    downloadById: jest.fn(async () => ({ stream: Readable.from([Buffer.from('avif')]), contentType: 'image/avif' })),
  };
  const forms = {
    streamAdminResultsCsv: jest.fn(async () => Readable.from(['Nome,E-mail\r\nAda,ada@example.test\r\n'])),
  };
  const badgeExports = {
    exportEvent: jest.fn(async () => ({
      file: new StreamableFile(Readable.from([Buffer.from('zip-data')])),
      fileName: 'badges.zip',
    })),
    exportMajorEvent: jest.fn(async () => ({
      file: new StreamableFile(Readable.from([Buffer.from('major-zip')])),
      fileName: 'major-badges.zip',
    })),
  };
  const rest = new AdminMcpRestOperations(
    transfer as unknown as DataTransferService,
    artifacts as unknown as McpAdminFileArtifactService,
    authorization as never,
    teamLogos as unknown as SportsTeamLogoService,
    sportsMutationEvents as unknown as SportsMutationEventsService,
    formImages as unknown as EventFormImagesService,
    forms as unknown as EventFormsService,
    badgeExports as unknown as SubscriptionBadgeExportService,
  );
  return { rest, transfer, artifacts, authorization, teamLogos, sportsMutationEvents, formImages, forms, badgeExports };
}

describe('typed administrative MCP REST operations', () => {
  it('covers every static REST field with a typed provider', () => {
    const { rest } = setup();
    expect(new Set(rest.fields())).toEqual(new Set(REST_ADMIN_OPERATION_FIELDS));
  });

  it('accepts native data-transfer documents larger than the generic 64 KiB MCP argument limit', () => {
    const { rest } = setup();
    const document = { note: 'x'.repeat(100_000) };
    const result = rest.operation('previewDataTransfer')?.schema.safeParse({ document });
    expect(result?.success).toBe(true);
    const tooLarge = { note: 'x'.repeat(5 * 1024 * 1024 + 1) };
    expect(rest.operation('previewDataTransfer')?.schema.safeParse({ document: tooLarge }).success).toBe(false);
    expect(
      rest.operation('previewDataTransfer')?.schema.safeParse({
        documentArtifactId: '019a4daa-1e09-70f8-82ef-7387bf68db0f',
        documentSha256: 'a'.repeat(64),
      }).success,
    ).toBe(true);
  });

  it('binds reviewed data-transfer artifacts to the exact owner, client, delegation, operation, hash, and target', async () => {
    const { rest, transfer, artifacts } = setup();
    const args = {
      documentArtifactId: '019a4daa-1e09-70f8-82ef-7387bf68db0f',
      documentSha256: 'd'.repeat(64),
      scope: { kind: 'event', id: 'event-1' },
      planHash: 'e'.repeat(64),
      allowPartial: false,
    };
    await rest.preflight('applyDataTransfer', args, actor(), execution('applyDataTransfer'));
    expect(artifacts.loadUpload).toHaveBeenCalledWith({
      userId: 'organizer-1',
      clientId: 'admin-mcp-client',
      delegationId: 'delegation-1',
      operation: 'applyDataTransfer',
      artifactId: args.documentArtifactId,
      expectedSha256: args.documentSha256,
      target: {},
    });
    expect(transfer.validateReviewedApply).toHaveBeenCalledWith(
      expect.objectContaining({ document: expect.objectContaining({ version: 1 }), planHash: args.planHash }),
      actor(),
    );
  });

  it('stores a data-transfer export as a typed downloadable JSON artifact bound to the native target', async () => {
    const { rest, artifacts } = setup();
    const result = await rest.execute(
      'exportDataTransfer',
      { target: { kind: 'major-event', id: 'major-1' }, includeDescendants: true, includeConfiguration: true },
      actor(),
      execution('exportDataTransfer'),
    );
    expect(artifacts.createExport).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'exportDataTransfer',
        target: { majorEventId: 'major-1' },
        fileName: 'event-data-export-major-event.json',
        contentType: 'application/json',
        bytes: Buffer.from(JSON.stringify({ resources: [{ kind: 'event', id: 'event-1', data: { name: 'Evento' } }] })),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ artifactId: 'artifact-1', issues: [] }));
    expect(result).not.toHaveProperty('document');
  });

  it('does not read a staged logo before current scoped update permission passes', async () => {
    const { rest, authorization, artifacts } = setup();
    authorization.assertPermissions.mockRejectedValueOnce(new ForbiddenException());
    await expect(
      rest.preflight(
        'uploadSportsTeamLogo',
        {
          sportsTeamId: 'team-1',
          expectedRevision: 2,
          artifactId: 'artifact-1',
          sha256: 'a'.repeat(64),
          fileName: 'logo.png',
          contentType: 'image/png',
        },
        actor(),
        execution('uploadSportsTeamLogo'),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(authorization.assertPermissions).toHaveBeenCalledWith(actor(), [Permission.SportsTeam.Update], {
      sportsTeamId: 'team-1',
    });
    expect(artifacts.loadUpload).not.toHaveBeenCalled();
  });

  it('uploads a team logo using its staged bytes and returns no controller download URL', async () => {
    const { rest, artifacts, teamLogos, sportsMutationEvents } = setup();
    const result = await rest.execute(
      'uploadSportsTeamLogo',
      {
        sportsTeamId: 'team-1',
        expectedRevision: 2,
        artifactId: 'artifact-1',
        sha256: 'a'.repeat(64),
        fileName: 'logo.png',
        contentType: 'image/png',
      },
      actor(),
      execution('uploadSportsTeamLogo'),
    );
    expect(artifacts.loadUpload).toHaveBeenCalledWith(expect.objectContaining({ target: { sportsTeamId: 'team-1' } }));
    expect(teamLogos.upload).toHaveBeenCalledWith(
      'team-1',
      2,
      expect.objectContaining({ mimetype: 'image/png', originalname: 'logo.png', size: 56 }),
      actor(),
    );
    expect(sportsMutationEvents.publishForEntity).toHaveBeenCalledWith('TEAM', 'team-1', true);
    expect(result).toEqual(expect.objectContaining({ teamId: 'team-1', revision: 3, sha256: 'b'.repeat(64) }));
    expect(result).not.toHaveProperty('downloadUrl');
  });

  it('preserves revision checks and the native 15 MiB team-logo limit', async () => {
    const { rest, artifacts, teamLogos } = setup();
    const valid = {
      sportsTeamId: 'team-1',
      expectedRevision: 2,
      artifactId: 'artifact-1',
      sha256: 'a'.repeat(64),
      fileName: 'logo.png',
      contentType: 'image/png',
    };
    expect(rest.operation('uploadSportsTeamLogo')?.schema.safeParse({ ...valid, expectedRevision: 0 }).success).toBe(
      false,
    );
    artifacts.loadUpload.mockResolvedValueOnce(Buffer.alloc(SPORTS_TEAM_LOGO_POLICY.maximumUploadBytes + 1));
    await expect(
      rest.execute('uploadSportsTeamLogo', valid, actor(), execution('uploadSportsTeamLogo')),
    ).rejects.toThrow(BadRequestException);
    expect(teamLogos.upload).not.toHaveBeenCalled();
  });

  it('returns a chunk-readable image artifact instead of raw bytes or storage URLs', async () => {
    const { rest, authorization, artifacts } = setup();
    const result = await rest.execute(
      'downloadSportsTeamLogo',
      { sportsTeamId: 'team-1', sha256: 'c'.repeat(64) },
      actor(),
      execution('downloadSportsTeamLogo'),
    );
    expect(authorization.assertPermissions).toHaveBeenCalledWith(actor(), [Permission.SportsTeam.Read], {
      sportsTeamId: 'team-1',
    });
    expect(artifacts.createExport).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'downloadSportsTeamLogo',
        target: { sportsTeamId: 'team-1', sha256: 'c'.repeat(64) },
        contentType: 'image/avif',
        bytes: Buffer.from('logo'),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ artifactId: 'artifact-1', contentType: 'image/avif' }));
    expect(result).not.toHaveProperty('objectKey');
    expect(result).not.toHaveProperty('downloadUrl');
    expect(result).not.toHaveProperty('base64');
  });

  it('turns permanent and pending form-image uploads into safe reviewed metadata', async () => {
    const { rest, formImages, artifacts } = setup();
    const permanent = await rest.execute(
      'uploadEventFormImage',
      {
        formId: 'form-1',
        artifactId: 'artifact-1',
        sha256: 'a'.repeat(64),
        fileName: 'banner.png',
        contentType: 'image/png',
      },
      actor(),
      execution('uploadEventFormImage'),
    );
    expect(artifacts.loadUpload).toHaveBeenCalledWith(expect.objectContaining({ target: { formId: 'form-1' } }));
    expect(formImages.upload).toHaveBeenCalledWith(
      'form-1',
      expect.objectContaining({ mimetype: 'image/png', originalname: 'banner.png' }),
      actor(),
    );
    expect(permanent).toEqual({ id: 'image-1', width: 32, height: 16 });
    expect(permanent).not.toHaveProperty('url');

    const pending = await rest.execute(
      'uploadPendingEventFormImage',
      {
        ownerMajorEventId: 'major-1',
        artifactId: 'artifact-2',
        sha256: 'b'.repeat(64),
        fileName: 'cover.svg',
        contentType: 'image/svg+xml',
      },
      actor(),
      execution('uploadPendingEventFormImage'),
    );
    expect(artifacts.loadUpload).toHaveBeenLastCalledWith(
      expect.objectContaining({ target: { ownerMajorEventId: 'major-1' } }),
    );
    expect(formImages.uploadPending).toHaveBeenCalledWith(
      expect.objectContaining({ mimetype: 'image/svg+xml', originalname: 'cover.svg' }),
      actor(),
      { ownerMajorEventId: 'major-1' },
    );
    expect(pending).toEqual({ id: 'image-2', width: 32, height: 16 });
  });

  it('streams result CSV and badge ZIP into bounded private artifacts', async () => {
    const { rest, authorization, artifacts, forms, badgeExports } = setup();
    const csv = await rest.execute(
      'exportEventFormResultsCsv',
      { formId: 'form-1' },
      actor(),
      execution('exportEventFormResultsCsv'),
    );
    expect(forms.streamAdminResultsCsv).toHaveBeenCalledWith(actor(), 'form-1');
    expect(artifacts.createExport).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ target: { formId: 'form-1' }, contentType: 'text/csv', bytes: expect.any(Buffer) }),
    );
    expect(csv).not.toHaveProperty('base64');

    const input = {
      eventId: 'event-1',
      fields: ['fullName'],
      identityDocumentMode: 'masked',
      errorCorrectionLevel: '23',
      format: 'svg',
      fileName: 'id',
    };
    const badges = await rest.execute(
      'exportEventSubscriptionBadgesZip',
      input,
      actor(),
      execution('exportEventSubscriptionBadgesZip'),
    );
    expect(authorization.assertPermissions).toHaveBeenCalledWith(
      actor(),
      [Permission.Subscription.Read, Permission.Event.Read, Permission.MajorEvent.Read],
      { eventId: 'event-1' },
    );
    expect(badgeExports.exportEvent).toHaveBeenCalledWith('event-1', expect.objectContaining({ fields: ['fullName'] }));
    expect(artifacts.createExport).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        target: { eventId: 'event-1' },
        contentType: 'application/zip',
        bytes: Buffer.from('zip-data'),
      }),
    );
    expect(badges).toEqual(expect.objectContaining({ artifactId: 'artifact-1' }));
  });
});
