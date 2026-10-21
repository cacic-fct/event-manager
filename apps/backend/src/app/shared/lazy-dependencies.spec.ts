import { jest as jestEsm } from '@jest/globals';
const { jest } = import.meta;
const mockDependencyLoads: string[] = [];

jestEsm.unstable_mockModule('playwright', () => {
  mockDependencyLoads.push('playwright');
  return {};
});
jestEsm.unstable_mockModule('@bwip-js/node', () => {
  mockDependencyLoads.push('@bwip-js/node');
  return {};
});
jestEsm.unstable_mockModule('tesseract.js', () => {
  mockDependencyLoads.push('tesseract.js');
  return {};
});
jestEsm.unstable_mockModule('sharp', () => {
  mockDependencyLoads.push('sharp');
  const sharp = Object.assign(jest.fn(), { cache: jest.fn(), concurrency: jest.fn() });
  return { default: sharp };
});

describe('backend lazy dependencies', () => {
  beforeEach(() => {
    mockDependencyLoads.length = 0;
  });

  it('loads feature services without loading rendering, image, barcode, or OCR dependencies', async () => {
    await jest.isolateModulesAsync(async () => {
      await import('../certificate/certificate-download.service');
      await import('../events/subscription-badge-export.service');
      await import('../major-event-receipts/major-event-receipts.processor');
      await import('../ticket-purchases/ticket-purchases.service');
      await import('../event-forms/event-form-image.utils');
      await import('../sports/logos/sports-team-logo-validation');
    });

    expect(mockDependencyLoads).toEqual([]);
  });

  it('shares the first Sharp load and applies the existing backend limits once', async () => {
    await jest.isolateModulesAsync(async () => {
      const { loadSharp } = await import('./load-sharp');
      const [first, second] = await Promise.all([loadSharp(), loadSharp()]);

      expect(first).toBe(second);
      expect(first.cache).toHaveBeenCalledTimes(1);
      expect(first.cache).toHaveBeenCalledWith({ files: 0, items: 0, memory: 32 });
      expect(first.concurrency).toHaveBeenCalledTimes(1);
      expect(first.concurrency).toHaveBeenCalledWith(1);
      expect(mockDependencyLoads).toEqual(['sharp']);
    });
  });
});
