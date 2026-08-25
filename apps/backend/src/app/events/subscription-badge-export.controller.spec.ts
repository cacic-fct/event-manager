import { Readable } from 'node:stream';
import { StreamableFile } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';
import { SubscriptionBadgeExportController } from './subscription-badge-export.controller';
import { SubscriptionBadgeExportService } from './subscription-badge-export.service';

describe('SubscriptionBadgeExportController', () => {
  const input = {
    fields: ['fullName'] as const,
    identityDocumentMode: 'masked' as const,
    errorCorrectionLevel: '35',
    format: 'svg' as const,
    fileName: 'id' as const,
  };

  it('requires all workspace subscription read permissions for event exports', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, SubscriptionBadgeExportController.prototype.exportEvent),
    ).toEqual([Permission.Subscription.Read, Permission.Event.Read, Permission.MajorEvent.Read]);
  });

  it('streams an event ZIP with attachment headers', async () => {
    const file = new StreamableFile(Readable.from([]));
    const exports = {
      exportEvent: jest.fn().mockResolvedValue({ file, fileName: '2026-07-25-12-30-evento.zip' }),
    };
    const controller = new SubscriptionBadgeExportController(exports as unknown as SubscriptionBadgeExportService);
    const response = createResponse();

    await expect(controller.exportEvent('event-1', input, response as never)).resolves.toBe(file);

    expect(exports.exportEvent).toHaveBeenCalledWith('event-1', input);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="2026-07-25-12-30-evento.zip"',
    );
  });

  it('streams a major-event ZIP with the selected archive settings', async () => {
    const file = new StreamableFile(Readable.from([]));
    const exports = {
      exportMajorEvent: jest.fn().mockResolvedValue({ file, fileName: '2026-07-25-12-30-grande-evento.zip' }),
    };
    const controller = new SubscriptionBadgeExportController(exports as unknown as SubscriptionBadgeExportService);
    const response = createResponse();

    await expect(controller.exportMajorEvent('major-event-1', input, response as never)).resolves.toBe(file);

    expect(exports.exportMajorEvent).toHaveBeenCalledWith('major-event-1', input);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="2026-07-25-12-30-grande-evento.zip"',
    );
  });
});

function createResponse() {
  return {
    setHeader: jest.fn(),
  };
}
