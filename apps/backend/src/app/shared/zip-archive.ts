import type { ZipArchive } from 'archiver';

export type ZipArchiveStream = InstanceType<typeof ZipArchive>;

export async function createZipArchive(): Promise<ZipArchiveStream> {
  const { ZipArchive } = await import('archiver');
  return new ZipArchive({ zlib: { level: 9 } });
}
