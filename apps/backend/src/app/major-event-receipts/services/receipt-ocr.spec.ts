import { ForbiddenException } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { ReceiptUploadService } from './receipt-upload.service';
const { jest } = import.meta;

describe('administrative receipt OCR chunks', () => {
  function setup() {
    const text = 'Texto do comprovante. '.repeat(4000);
    const prisma = { majorEventReceipt: { findUnique: jest.fn(async () => ({ ocrText: text })) } };
    const policy = { assertPermissions: jest.fn(async () => undefined) };
    const service = new ReceiptUploadService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      policy as never,
      {} as never,
      undefined,
      undefined,
      {} as never,
    );
    return { text, prisma, policy, service, user: { sub: 'reviewer' } as never };
  }
  it('returns every character across bounded chunks and checks the actual receipt each time', async () => {
    const f = setup();
    let offset: number | null = 0;
    let actual = '';
    while (offset !== null) {
      const chunk = await f.service.getAdminOcrText('receipt', offset, f.user);
      expect(chunk.text.length).toBeLessThanOrEqual(16000);
      expect(chunk.totalLength).toBe(f.text.length);
      actual += chunk.text;
      offset = chunk.nextOffset;
    }
    expect(actual).toBe(f.text);
    expect(f.policy.assertPermissions).toHaveBeenCalledWith(f.user, [Permission.Receipt.Read], {
      receiptId: 'receipt',
    });
  });
  it('rejects denied access before reading OCR and rejects invalid offsets', async () => {
    const f = setup();
    f.policy.assertPermissions.mockRejectedValueOnce(new ForbiddenException());
    await expect(f.service.getAdminOcrText('receipt', 0, f.user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.prisma.majorEventReceipt.findUnique).not.toHaveBeenCalled();
    await expect(f.service.getAdminOcrText('receipt', -1, f.user)).rejects.toThrow('offset');
    await expect(f.service.getAdminOcrText('receipt', f.text.length + 1, f.user)).rejects.toThrow('offset');
  });
});
