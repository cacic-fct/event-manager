import sharp from 'sharp';
import { SportsTeamLogoService } from './sports-team-logo.service';

describe('SportsTeamLogoService representative queue', () => {
  const prisma = {
    sportsTeam: {
      findFirst: jest.fn(),
    },
    sportsTeamChangeRequest: {
      findFirst: jest.fn(),
    },
  };
  const s3 = {
    uploadFile: jest.fn(),
    deleteFile: jest.fn(),
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
    return new SportsTeamLogoService(prisma as never, s3 as never, {} as never, {} as never, teamChanges as never);
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
      create: { width: 5000, height: 3000, channels: 3, background: '#1565c0' },
    })
      .avif({ quality: 100 })
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
});
