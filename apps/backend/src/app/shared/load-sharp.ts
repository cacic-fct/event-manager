import type sharp from 'sharp';

let sharpPromise: Promise<typeof sharp> | undefined;

export function loadSharp(): Promise<typeof sharp> {
  sharpPromise ??= import('sharp')
    .then(({ default: sharp }) => {
      // Preserve the backend's shared image-processing limits without loading libvips at startup.
      sharp.cache({ files: 0, items: 0, memory: 32 });
      sharp.concurrency(1);
      return sharp;
    })
    .catch((error: unknown) => {
      sharpPromise = undefined;
      throw error;
    });
  return sharpPromise;
}
