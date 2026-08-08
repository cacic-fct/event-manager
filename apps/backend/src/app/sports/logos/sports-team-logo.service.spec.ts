import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AuditLogEntityType, AuditLogOperation } from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import {
  MAX_SPORTS_TEAM_LOGO_SIZE_BYTES,
  SportsTeamLogoService,
} from './sports-team-logo.service';

describe('SportsTeamLogoService', () => {
  const actor = {
    sub: 'admin-1',
    token: 'token',
    permissionSet: new Set<string>(),
  } as never;
  const prisma = {
    sportsTeam: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const s3 = {
    fileExists: jest.fn(),
    uploadFile: jest.fn(),
    downloadFile: jest.fn(),
    deleteFile: jest.fn(),
  };
  const frozen = {
    assertMajorEventMutable: jest.fn(),
  };
  const auditLog = {
    record: jest.fn(),
  };
  const teamChanges = {
    submit: jest.fn(),
  };
  let tx: ReturnType<typeof createTx>;
  let service: SportsTeamLogoService;
  let png: Buffer;

  beforeAll(async () => {
    png = await sharp({
      create: {
        width: 256,
        height: 128,
        channels: 4,
        background: '#3366ff',
      },
    })
      .png()
      .toBuffer();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    tx = createTx(png);
    prisma.sportsTeam.findFirst.mockResolvedValue(createTeam());
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    );
    s3.fileExists.mockResolvedValue(false);
    s3.uploadFile.mockResolvedValue({ key: 'stored-key', size: png.length });
    teamChanges.submit.mockResolvedValue({
      id: 'change-1',
      requestRevision: 2,
    });
    service = new SportsTeamLogoService(
      prisma as never,
      s3 as never,
      frozen as never,
      auditLog as never,
      teamChanges as never,
    );
  });

  it('stores a representative logo immutably but queues its delta instead of publishing it', async () => {
    const sha256 = createHash('sha256').update(png).digest('hex');

    await expect(
      service.submitRepresentativeUpload(
        'team-1',
        4,
        1,
        createFile(png, 'image/png'),
        'person-1',
      ),
    ).resolves.toEqual({
      requestId: 'change-1',
      requestRevision: 2,
      sha256,
      mimeType: 'image/png',
      sizeBytes: png.length,
      width: 256,
      height: 128,
    });

    const objectKey = `sports/tournaments/tournament-1/teams/team-1/logos/sha256/${sha256}.png`;
    expect(s3.uploadFile).toHaveBeenCalledWith(objectKey, png, 'image/png', {
      sha256,
      immutable: 'true',
      pendingReview: 'true',
    });
    expect(teamChanges.submit).toHaveBeenCalledWith(
      'team-1',
      'person-1',
      {
        type: 'LOGO',
        baseRevision: 4,
        expectedRequestRevision: 1,
        delta: {
          logo: {
            objectKey,
            sha256,
            mimeType: 'image/png',
            sizeBytes: png.length,
          },
        },
      },
      true,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('stores validated content under a non-expiring SHA-256 key and persists with revision CAS', async () => {
    const sha256 = createHash('sha256').update(png).digest('hex');

    await expect(service.upload('team-1', 4, createFile(png, 'image/png'), actor)).resolves.toEqual({
      teamId: 'team-1',
      revision: 5,
      sha256,
      mimeType: 'image/png',
      sizeBytes: png.length,
      width: 256,
      height: 128,
      downloadUrl: `/api/sports/admin/teams/team-1/logo/${sha256}`,
    });

    const expectedKey = `sports/tournaments/tournament-1/teams/team-1/logos/sha256/${sha256}.png`;
    expect(s3.uploadFile).toHaveBeenCalledWith(
      expectedKey,
      png,
      'image/png',
      {
        sha256,
        immutable: 'true',
      },
    );
    expect(tx.sportsTeam.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'team-1',
        revision: 4,
        deletedAt: null,
      },
      data: expect.objectContaining({
        logoObjectKey: expectedKey,
        logoSha256: sha256,
        logoMimeType: 'image/png',
        logoSizeBytes: png.length,
        revision: { increment: 1 },
        fieldRevisions: {
          name: 3,
          logo: 5,
        },
        updatedById: 'admin-1',
      }),
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: AuditLogEntityType.SPORTS_TEAM,
        operation: AuditLogOperation.UPDATE,
        scope: {
          permission: Permission.SportsTeam.Update,
          majorEventId: 'major-1',
        },
      }),
      tx,
    );
    expect(s3.deleteFile).not.toHaveBeenCalled();
  });

  it('does not upload an object that already exists at the content-addressed key', async () => {
    s3.fileExists.mockResolvedValue(true);

    await service.upload('team-1', 4, createFile(png, 'image/png'), actor);

    expect(s3.uploadFile).not.toHaveBeenCalled();
    expect(tx.sportsTeam.updateMany).toHaveBeenCalled();
  });

  it('accepts JPEG and WebP based on decoded content and uses canonical extensions', async () => {
    const jpeg = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: '#ffcc00',
      },
    })
      .jpeg()
      .toBuffer();
    const webp = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 4,
        background: '#33cc99',
      },
    })
      .webp()
      .toBuffer();

    for (const candidate of [
      { buffer: jpeg, mimeType: 'image/jpeg', extension: 'jpg' },
      { buffer: webp, mimeType: 'image/webp', extension: 'webp' },
    ]) {
      const sha256 = createHash('sha256').update(candidate.buffer).digest('hex');
      tx.sportsTeam.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'team-1',
        revision: 5,
        logoObjectKey: 'stored-key',
        logoSha256: sha256,
        logoMimeType: candidate.mimeType,
        logoSizeBytes: candidate.buffer.length,
      });

      await expect(
        service.upload(
          'team-1',
          4,
          createFile(candidate.buffer, candidate.mimeType),
          actor,
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          sha256,
          mimeType: candidate.mimeType,
        }),
      );
      expect(s3.uploadFile).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`${sha256}\\.${candidate.extension}$`),
        ),
        candidate.buffer,
        candidate.mimeType,
        expect.any(Object),
      );
    }
  });

  it('treats a repeated upload of the persisted bytes as idempotent even after the revision advanced', async () => {
    const sha256 = createHash('sha256').update(png).digest('hex');
    prisma.sportsTeam.findFirst.mockResolvedValue({
      ...createTeam(),
      revision: 5,
      logoObjectKey: `sports/tournaments/tournament-1/teams/team-1/logos/sha256/${sha256}.png`,
      logoSha256: sha256,
      logoMimeType: 'image/png',
      logoSizeBytes: png.length,
    });

    await expect(service.upload('team-1', 4, createFile(png, 'image/png'), actor)).resolves.toEqual(
      expect.objectContaining({
        revision: 5,
        sha256,
      }),
    );

    expect(s3.fileExists).not.toHaveBeenCalled();
    expect(s3.uploadFile).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it('rejects stale revisions before writing storage and preserves existing immutable objects', async () => {
    await expect(service.upload('team-1', 3, createFile(png, 'image/png'), actor)).rejects.toThrow(
      ConflictException,
    );

    expect(s3.fileExists).not.toHaveBeenCalled();
    expect(s3.uploadFile).not.toHaveBeenCalled();
    expect(s3.deleteFile).not.toHaveBeenCalled();
  });

  it('leaves the new immutable object in storage when the database CAS loses a race', async () => {
    tx.sportsTeam.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.upload('team-1', 4, createFile(png, 'image/png'), actor)).rejects.toThrow(
      ConflictException,
    );

    expect(s3.uploadFile).toHaveBeenCalled();
    expect(s3.deleteFile).not.toHaveBeenCalled();
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it('validates actual raster content, MIME agreement, size, and dimensions', async () => {
    await expect(
      service.upload('team-1', 4, createFile(Buffer.from('not an image'), 'image/png'), actor),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.upload('team-1', 4, createFile(png, 'image/jpeg'), actor),
    ).rejects.toThrow(BadRequestException);

    const oversized = Buffer.alloc(MAX_SPORTS_TEAM_LOGO_SIZE_BYTES + 1);
    await expect(
      service.upload('team-1', 4, createFile(oversized, 'image/png'), actor),
    ).rejects.toThrow(BadRequestException);

    const tiny = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: '#000000',
      },
    })
      .webp()
      .toBuffer();
    await expect(
      service.upload('team-1', 4, createFile(tiny, 'image/webp'), actor),
    ).rejects.toThrow(BadRequestException);

    expect(s3.uploadFile).not.toHaveBeenCalled();
  });

  it('downloads only the currently persisted hash and discards S3 metadata', async () => {
    const sha256 = 'a'.repeat(64);
    const stream = Readable.from(['logo']);
    prisma.sportsTeam.findFirst.mockResolvedValue({
      logoObjectKey: 'private-storage-key',
      logoSha256: sha256,
      logoMimeType: 'image/webp',
      logoSizeBytes: 4,
    });
    s3.downloadFile.mockResolvedValue({
      stream,
      contentType: 'application/octet-stream',
      contentLength: 999,
      metadata: {
        personId: 'must-not-leak',
      },
    });

    await expect(service.download('team-1', sha256)).resolves.toEqual({
      stream,
      mimeType: 'image/webp',
      sizeBytes: 4,
      sha256,
    });
    expect(s3.downloadFile).toHaveBeenCalledWith('private-storage-key');

    await expect(service.download('team-1', 'invalid')).rejects.toThrow(NotFoundException);
  });
});

function createFile(buffer: Buffer, mimetype: string) {
  return {
    buffer,
    mimetype,
    originalname: 'logo.png',
    size: buffer.length,
  };
}

function createTeam() {
  return {
    id: 'team-1',
    name: 'Equipe Azul',
    tournamentId: 'tournament-1',
    revision: 4,
    fieldRevisions: {
      name: 3,
    },
    logoObjectKey: 'old-immutable-key',
    logoSha256: 'b'.repeat(64),
    logoMimeType: 'image/webp',
    logoSizeBytes: 120,
    tournament: {
      majorEventId: 'major-1',
      deletedAt: null,
    },
  };
}

function createTx(png: Buffer) {
  return {
    sportsTeam: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'team-1',
        revision: 5,
        logoObjectKey: 'stored-key',
        logoSha256: createHash('sha256').update(png).digest('hex'),
        logoMimeType: 'image/png',
        logoSizeBytes: png.length,
      }),
    },
  };
}
