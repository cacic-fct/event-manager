import sharp from 'sharp';
import { Readable } from 'node:stream';
import { SportsTeamLogoService } from './sports-team-logo.service';

describe('SportsTeamLogoService representative queue', () => {
  const prisma = {
    sportsTeam: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    sportsTeamChangeRequest: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const s3 = {
    uploadFile: jest.fn(),
    deleteFile: jest.fn(),
    downloadFile: jest.fn(),
    fileExists: jest.fn(),
  };
  const teamChanges = {
    submit: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.sportsTeam.findFirst.mockResolvedValue({
      id: 'team-1',
      tournamentId: 'tournament-1',
    });
    prisma.sportsTeamChangeRequest.findFirst.mockResolvedValue(null);
    s3.uploadFile.mockResolvedValue({ key: 'queued', size: 100 });
    s3.deleteFile.mockResolvedValue(undefined);
    teamChanges.submit.mockResolvedValue({
      id: 'request-1',
      requestRevision: 2,
    });
  });

  function createService(): SportsTeamLogoService {
    return new SportsTeamLogoService(
      prisma as never,
      s3 as never,
      { assertMajorEventMutable: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      teamChanges as never,
    );
  }

  it('converts a representative raster upload to AVIF and queues it under a private key', async () => {
    const png = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 4,
        background: '#1565c0',
      },
    })
      .png()
      .toBuffer();

    const result = await createService().submitRepresentativeUpload(
      'team-1',
      4,
      1,
      {
        buffer: png,
        mimetype: 'image/png',
        originalname: 'team.png',
        size: png.length,
      },
      'representative-1',
    );

    expect(result).toMatchObject({
      requestId: 'request-1',
      requestRevision: 2,
      mimeType: 'image/avif',
      width: 32,
      height: 32,
    });
    expect(s3.uploadFile).toHaveBeenCalledWith(
      expect.stringMatching(/^sports\/private\/team-logo-review\/team-1\/[^/]+\/[a-f0-9]{64}\.avif$/),
      expect.any(Buffer),
      'image/avif',
      expect.objectContaining({
        private: 'true',
        pendingReview: 'true',
      }),
    );
    expect(teamChanges.submit).toHaveBeenCalledWith(
      'team-1',
      'representative-1',
      expect.objectContaining({
        delta: {
          logo: expect.objectContaining({
            objectKey: expect.stringMatching(
              /^sports\/tournaments\/tournament-1\/teams\/team-1\/logos\/sha256\/[a-f0-9]{64}\.avif$/,
            ),
            queuedObjectKey: expect.stringMatching(/^sports\/private\/team-logo-review\//),
            mimeType: 'image/avif',
          }),
        },
      }),
      true,
    );
  });

  it('rejects executable SVG content before writing to the private queue', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><script>alert(1)</script></svg>',
    );

    await expect(
      createService().submitRepresentativeUpload(
        'team-1',
        4,
        undefined,
        {
          buffer: svg,
          mimetype: 'image/svg+xml',
          originalname: 'unsafe.svg',
          size: svg.length,
        },
        'representative-1',
      ),
    ).rejects.toThrow('conteúdo executável');
    expect(s3.uploadFile).not.toHaveBeenCalled();
    expect(teamChanges.submit).not.toHaveBeenCalled();
  });

  it('does not fail a committed queue when superseded-object cleanup is unavailable', async () => {
    const previousQueuedObjectKey = 'sports/private/team-logo-review/team-1/old/logo.avif';
    prisma.sportsTeamChangeRequest.findFirst.mockResolvedValue({
      delta: { logo: { queuedObjectKey: previousQueuedObjectKey } },
    });
    s3.deleteFile.mockRejectedValue(new Error('temporary storage failure'));

    const png = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 4,
        background: '#1565c0',
      },
    })
      .png()
      .toBuffer();

    await expect(
      createService().submitRepresentativeUpload(
        'team-1',
        4,
        1,
        {
          buffer: png,
          mimetype: 'image/png',
          originalname: 'team.png',
          size: png.length,
        },
        'representative-1',
      ),
    ).resolves.toMatchObject({ requestId: 'request-1' });
    expect(s3.deleteFile).toHaveBeenCalledWith(previousQueuedObjectKey);
  });

  it('sanitizes and rasterizes an accepted SVG before private queue storage', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#1565c0"/></svg>',
    );

    const result = await createService().submitRepresentativeUpload(
      'team-1',
      4,
      undefined,
      {
        buffer: svg,
        mimetype: 'image/svg+xml',
        originalname: 'safe.svg',
        size: svg.length,
      },
      'representative-1',
    );

    expect(result.mimeType).toBe('image/avif');
    expect(s3.uploadFile).toHaveBeenCalledWith(
      expect.stringMatching(/\.avif$/),
      expect.any(Buffer),
      'image/avif',
      expect.any(Object),
    );
    expect(s3.uploadFile).not.toHaveBeenCalledWith(
      expect.stringMatching(/\.svg$/),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('downscales a high-resolution input and recompresses an existing AVIF', async () => {
    const avif = await sharp({
      create: { width: 3200, height: 1920, channels: 3, background: '#1565c0' },
    })
      .avif({ quality: 82 })
      .toBuffer();
    const result = await createService().submitRepresentativeUpload(
      'team-1',
      4,
      undefined,
      { buffer: avif, mimetype: 'image/avif', originalname: 'huge.avif', size: avif.length },
      'representative-1',
    );
    expect(result).toMatchObject({ mimeType: 'image/avif', width: 1600, height: 960 });
    const queued = s3.uploadFile.mock.calls[0]?.[1] as Buffer;
    expect((await sharp(queued).metadata()).format).toBe('heif');
  });

  it('streams the private logo attached to an active review request', async () => {
    const sha256 = 'c'.repeat(64);
    const queuedObjectKey = `sports/private/team-logo-review/team-1/request-1/${sha256}.avif`;
    const stream = Readable.from(['pending-logo']);
    prisma.sportsTeamChangeRequest.findFirst.mockResolvedValue({
      delta: {
        logo: {
          queuedObjectKey,
          sha256,
          mimeType: 'image/avif',
          sizeBytes: 12,
        },
      },
    });
    s3.downloadFile.mockResolvedValue({
      stream,
      contentType: 'image/avif',
      contentLength: 12,
    });

    await expect(createService().downloadPendingReview('team-1', 'request-1')).resolves.toEqual({
      stream,
      mimeType: 'image/avif',
      sizeBytes: 12,
      sha256,
    });
    expect(prisma.sportsTeamChangeRequest.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'request-1',
        teamId: 'team-1',
        type: 'LOGO',
        status: { in: ['PENDING', 'CHANGES_REQUESTED', 'CONFLICT'] },
      },
      select: { delta: true },
    });
    expect(s3.downloadFile).toHaveBeenCalledWith(queuedObjectKey);
  });

  it('does not stream a review when its queued logo metadata is invalid', async () => {
    prisma.sportsTeamChangeRequest.findFirst.mockResolvedValue({
      delta: { logo: { queuedObjectKey: 'sports/private/not-a-review-object' } },
    });

    await expect(createService().downloadPendingReview('team-1', 'request-1')).rejects.toThrow(
      'Pending sports team logo review request-1 was not found.',
    );
    expect(s3.downloadFile).not.toHaveBeenCalled();
  });

  it('does not stream a queued logo belonging to another team', async () => {
    const sha256 = 'd'.repeat(64);
    prisma.sportsTeamChangeRequest.findFirst.mockResolvedValue({
      delta: {
        logo: {
          queuedObjectKey: `sports/private/team-logo-review/team-2/request-1/${sha256}.avif`,
          sha256,
          mimeType: 'image/avif',
          sizeBytes: 12,
        },
      },
    });

    await expect(createService().downloadPendingReview('team-1', 'request-1')).rejects.toThrow(
      'Pending sports team logo review request-1 was not found.',
    );
    expect(s3.downloadFile).not.toHaveBeenCalled();
  });

  it('does not delete a logo object that a concurrent winner committed', async () => {
    const png = await sharp({
      create: { width: 32, height: 32, channels: 4, background: '#1565c0' },
    }).png().toBuffer();
    prisma.sportsTeam.findFirst
      .mockResolvedValueOnce({
        id: 'team-1',
        name: 'Team',
        tournamentId: 'tournament-1',
        revision: 4,
        fieldRevisions: {},
        logoObjectKey: null,
        logoSha256: null,
        logoMimeType: null,
        logoSizeBytes: null,
        tournament: { majorEventId: 'major-1', deletedAt: null },
      })
      .mockResolvedValueOnce({ id: 'team-1' });
    s3.fileExists.mockResolvedValue(false);
    s3.uploadFile.mockResolvedValue({ key: 'final-object', size: png.length });
    prisma.$transaction.mockImplementation(async () => {
      throw new Error('revision conflict');
    });

    await expect(
      createService().upload(
        'team-1',
        4,
        { buffer: png, mimetype: 'image/png', originalname: 'team.png', size: png.length },
        { sub: 'admin-1' } as never,
      ),
    ).rejects.toThrow('revision conflict');
    expect(s3.deleteFile).not.toHaveBeenCalledWith(expect.any(String));
  });
});
