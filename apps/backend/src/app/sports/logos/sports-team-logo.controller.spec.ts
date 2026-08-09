import 'reflect-metadata';
import { Permission } from '@cacic-fct/shared-permissions';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY, REQUIRED_PERMISSIONS_KEY } from '../../auth/auth.constants';
import { RATE_LIMIT_METADATA_KEY, RateLimitMetadata } from '../../rate-limit/rate-limit.decorator';
import { RATE_LIMIT_POLICIES } from '../../rate-limit/rate-limit.policies';
import { Readable } from 'node:stream';
import { PublicSportsTeamLogoController, SportsTeamLogoController } from './sports-team-logo.controller';

describe('SportsTeamLogoController', () => {
  const actor = {
    sub: 'admin-1',
    token: 'token',
    permissionSet: new Set<string>(),
  } as never;
  const logos = {
    upload: jest.fn(),
    download: jest.fn(),
  };
  const mutationEvents = {
    publishForEntity: jest.fn(),
  };
  let controller: SportsTeamLogoController;

  beforeEach(() => {
    jest.clearAllMocks();
    mutationEvents.publishForEntity.mockResolvedValue(undefined);
    controller = new SportsTeamLogoController(logos as never, mutationEvents as never);
  });

  it('delegates upload with the scoped authenticated actor and revision', async () => {
    const file = {
      buffer: Buffer.from('logo'),
      mimetype: 'image/png',
      originalname: 'logo.png',
      size: 4,
    };
    logos.upload.mockResolvedValue({
      teamId: 'team-1',
      revision: 3,
    });

    await expect(
      controller.upload('team-1', 2, file, {
        user: actor,
      } as never),
    ).resolves.toEqual({
      teamId: 'team-1',
      revision: 3,
    });
    expect(logos.upload).toHaveBeenCalledWith('team-1', 2, file, actor);
    expect(mutationEvents.publishForEntity).toHaveBeenCalledWith('TEAM', 'team-1', true);
  });

  it('keeps the committed upload response when mutation publication fails', async () => {
    logos.upload.mockResolvedValue({ teamId: 'team-1', revision: 3 });
    mutationEvents.publishForEntity.mockRejectedValue(new Error('Redis unavailable'));

    await expect(
      controller.upload('team-1', 2, undefined, {
        user: actor,
      } as never),
    ).resolves.toEqual({ teamId: 'team-1', revision: 3 });
  });

  it('streams only persisted public image headers with a content-derived ETag', async () => {
    const stream = Readable.from(['logo']);
    const sha256 = 'a'.repeat(64);
    logos.download.mockResolvedValue({
      stream,
      mimeType: 'image/webp',
      sizeBytes: 4,
      sha256,
    });
    const response = {
      setHeader: jest.fn(),
    };

    const result = await controller.download('team-1', sha256, response as never);

    expect(logos.download).toHaveBeenCalledWith('team-1', sha256);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'image/webp');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Length', '4');
    expect(response.setHeader).toHaveBeenCalledWith('ETag', `"sha256-${sha256}"`);
    expect(result.getStream()).toBe(stream);
  });

  it('declares scoped permissions, upload throttling, and immutable download caching', () => {
    const uploadHandler = SportsTeamLogoController.prototype.upload;
    const downloadHandler = SportsTeamLogoController.prototype.download;

    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, uploadHandler)).toEqual([Permission.SportsTeam.Update]);
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, downloadHandler)).toEqual([Permission.SportsTeam.Read]);
    expect(Reflect.getMetadata(RATE_LIMIT_METADATA_KEY, uploadHandler) as RateLimitMetadata).toEqual({
      policy: RATE_LIMIT_POLICIES.receiptUpload,
      resources: [{ source: 'params', path: 'sportsTeamId' }],
    });

    const headers = Reflect.getMetadata(HEADERS_METADATA, downloadHandler) as Array<{
      name: string;
      value: string;
    }>;
    expect(headers).toEqual(
      expect.arrayContaining([
        {
          name: 'Cache-Control',
          value: 'private, max-age=31536000, immutable',
        },
        {
          name: 'X-Content-Type-Options',
          value: 'nosniff',
        },
      ]),
    );
  });

  it('marks the published logo controller as public', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PublicSportsTeamLogoController)).toBe(true);
  });
});
