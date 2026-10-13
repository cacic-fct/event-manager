const mockDependencyLoads: string[] = [];

jest.mock('playwright', () => {
  mockDependencyLoads.push('playwright');
  return {};
});
jest.mock('@bwip-js/node', () => {
  mockDependencyLoads.push('@bwip-js/node');
  return {};
});
jest.mock('tesseract.js', () => {
  mockDependencyLoads.push('tesseract.js');
  return {};
});
jest.mock('sharp', () => {
  mockDependencyLoads.push('sharp');
  const sharp = Object.assign(jest.fn(), { cache: jest.fn(), concurrency: jest.fn() });
  return { __esModule: true, default: sharp };
});

describe('backend lazy dependencies', () => {
  beforeEach(() => {
    mockDependencyLoads.length = 0;
  });

  it('loads feature services without loading rendering, image, barcode, or OCR dependencies', () => {
    jest.isolateModules(() => {
      jest.requireActual('../certificate/certificate-download.service');
      jest.requireActual('../events/subscription-badge-export.service');
      jest.requireActual('../major-event-receipts/major-event-receipts.processor');
      jest.requireActual('../ticket-purchases/ticket-purchases.service');
      jest.requireActual('../event-forms/event-form-image.utils');
      jest.requireActual('../sports/logos/sports-team-logo-validation');
    });

    expect(mockDependencyLoads).toEqual([]);
  });

  it('shares the first Sharp load and applies the existing backend limits once', async () => {
    await jest.isolateModulesAsync(async () => {
      const { loadSharp } = jest.requireActual<typeof import('./load-sharp')>('./load-sharp');
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
