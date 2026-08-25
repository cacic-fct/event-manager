import { ForbiddenException } from '@nestjs/common';
import { HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Readable } from 'node:stream';
import { SportsTeamRepresentativeLogoController } from './sports-team-logo.controller';
import { RATE_LIMIT_METADATA_KEY } from '../../rate-limit/rate-limit.decorator';
import { RATE_LIMIT_POLICIES } from '../../rate-limit/rate-limit.policies';

describe('SportsTeamRepresentativeLogoController boundary operations', () => {
  let logos: { submitRepresentativeUpload: jest.Mock; download: jest.Mock };
  let access: { requireTeamRepresentative: jest.Mock; requireTeamRepresentativeReader: jest.Mock };
  let controller: SportsTeamRepresentativeLogoController;

  beforeEach(() => {
    logos = {
      submitRepresentativeUpload: jest.fn(),
      download: jest.fn(),
    };
    access = {
      requireTeamRepresentative: jest.fn(),
      requireTeamRepresentativeReader: jest.fn(),
    };
    controller = new SportsTeamRepresentativeLogoController(logos as never, access as never);
  });

  it('declares the representative logo-change route and resource rate limit', () => {
    const handler = SportsTeamRepresentativeLogoController.prototype.submitChange;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':sportsTeamId/logo-change');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(1);
    expect(Reflect.getMetadata(RATE_LIMIT_METADATA_KEY, handler)).toEqual({
      policy: RATE_LIMIT_POLICIES.receiptUpload,
      resources: [{ source: 'params', path: 'sportsTeamId' }],
    });
  });

  it('requires a team representative and forwards revision, request revision, file, and actor id exactly', async () => {
    const actor = { id: 'representative-person' };
    const request = { user: { sub: 'representative-user' } };
    const file = {
      buffer: Buffer.from('logo'),
      mimetype: 'image/png',
      originalname: 'logo.png',
      size: 4,
    };
    const result = {
      id: 'change-1',
      sha256: 'a'.repeat(64),
      mimeType: 'image/avif',
      sizeBytes: 4,
    };
    access.requireTeamRepresentative.mockResolvedValue({ actor });
    logos.submitRepresentativeUpload.mockResolvedValue(result);

    await expect(controller.submitChange('team-1', 7, 11, file, request as never)).resolves.toBe(result);

    expect(access.requireTeamRepresentative).toHaveBeenCalledWith({ req: request }, 'team-1');
    expect(logos.submitRepresentativeUpload).toHaveBeenCalledWith('team-1', 7, 11, file, 'representative-person');
  });

  it('forwards an omitted expected request revision and an absent file without inventing values', async () => {
    const actor = { id: 'representative-person' };
    access.requireTeamRepresentative.mockResolvedValue({ actor });
    logos.submitRepresentativeUpload.mockResolvedValue({ id: 'change-1' });

    await controller.submitChange('team-1', 7, undefined, undefined, { user: { sub: 'user-1' } } as never);

    expect(logos.submitRepresentativeUpload).toHaveBeenCalledWith(
      'team-1',
      7,
      undefined,
      undefined,
      'representative-person',
    );
  });

  it('does not submit a logo when representative authorization fails', async () => {
    const failure = new ForbiddenException('Team representative access required.');
    access.requireTeamRepresentative.mockRejectedValue(failure);

    await expect(
      controller.submitChange('team-1', 7, 11, undefined, { user: { sub: 'user-1' } } as never),
    ).rejects.toBe(failure);

    expect(logos.submitRepresentativeUpload).not.toHaveBeenCalled();
  });

  it('preserves logo-service validation or conflict errors', async () => {
    const failure = new Error('Logo revision conflict.');
    access.requireTeamRepresentative.mockResolvedValue({ actor: { id: 'representative-person' } });
    logos.submitRepresentativeUpload.mockRejectedValue(failure);

    await expect(
      controller.submitChange('team-1', 7, 11, undefined, { user: { sub: 'user-1' } } as never),
    ).rejects.toBe(failure);
  });

  it('declares the represented-team download route with immutable private caching', () => {
    const handler = SportsTeamRepresentativeLogoController.prototype.downloadCurrent;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':sportsTeamId/logo/:sha256');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(0);
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual(
      expect.arrayContaining([
        { name: 'Cache-Control', value: 'private, max-age=31536000, immutable' },
        { name: 'X-Content-Type-Options', value: 'nosniff' },
      ]),
    );
  });

  it('authorizes the represented team before streaming the exact immutable logo and response headers', async () => {
    const actor = { id: 'representative-person' };
    const request = { user: { sub: 'representative-user' } };
    const stream = Readable.from(['logo']);
    const sha256 = 'c'.repeat(64);
    const response = { setHeader: jest.fn() };
    access.requireTeamRepresentativeReader.mockResolvedValue({ actor });
    logos.download.mockResolvedValue({ stream, mimeType: 'image/avif', sizeBytes: 4, sha256 });

    const result = await controller.downloadCurrent('team-1', sha256, request as never, response as never);

    expect(access.requireTeamRepresentativeReader).toHaveBeenCalledWith({ req: request }, 'team-1');
    expect(logos.download).toHaveBeenCalledWith('team-1', sha256);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'image/avif');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Length', '4');
    expect(response.setHeader).toHaveBeenCalledWith('ETag', `"sha256-${sha256}"`);
    expect(result.getStream()).toBe(stream);
  });

  it('does not read a represented-team logo when access or storage fails', async () => {
    const accessFailure = new ForbiddenException('Team representative access required.');
    access.requireTeamRepresentativeReader.mockRejectedValue(accessFailure);

    await expect(
      controller.downloadCurrent(
        'team-1',
        'd'.repeat(64),
        { user: { sub: 'user-1' } } as never,
        {
          setHeader: jest.fn(),
        } as never,
      ),
    ).rejects.toBe(accessFailure);
    expect(logos.download).not.toHaveBeenCalled();

    const storageFailure = new Error('Logo unavailable.');
    access.requireTeamRepresentativeReader.mockResolvedValue({ actor: { id: 'representative-person' } });
    logos.download.mockRejectedValue(storageFailure);
    await expect(
      controller.downloadCurrent(
        'team-1',
        'e'.repeat(64),
        { user: { sub: 'user-1' } } as never,
        {
          setHeader: jest.fn(),
        } as never,
      ),
    ).rejects.toBe(storageFailure);
  });
});
