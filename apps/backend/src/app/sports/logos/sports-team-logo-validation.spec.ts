import sharp from 'sharp';
import { validateSportsTeamLogoImage } from './sports-team-logo-validation';
import type { SportsTeamLogoUploadFile } from './sports-team-logo.service';

describe('sports team logo validation', () => {
  it('normalizes a valid raster logo to bounded AVIF output', async () => {
    const file = await rasterFile(64, 32);

    const result = await validateSportsTeamLogoImage(file);

    expect(result).toMatchObject({ mimeType: 'image/avif', extension: 'avif', width: 64, height: 32 });
    expect(result.buffer.length).toBeGreaterThan(0);
    await expect(sharp(result.buffer).metadata()).resolves.toMatchObject({ format: 'heif', width: 64, height: 32 });
  });

  it.each([
    { file: undefined, message: 'O arquivo de logo da equipe é obrigatório.' },
    {
      file: { buffer: Buffer.from('x'), mimetype: 'image/png', size: 2 },
      message: 'O logo da equipe deve ter no máximo 15 MB.',
    },
    {
      file: { buffer: Buffer.from('not an image'), mimetype: 'image/png', size: 12 },
      message: 'O logo deve ser uma imagem PNG, JPEG, WebP, AVIF ou SVG válida.',
    },
  ])('rejects invalid upload input', async ({ file, message }) => {
    await expect(validateSportsTeamLogoImage(file)).rejects.toThrow(message);
  });

  it('rejects content whose detected type differs from its declared MIME type', async () => {
    const file = await rasterFile(64, 64);

    await expect(validateSportsTeamLogoImage({ ...file, mimetype: 'image/jpeg' })).rejects.toThrow(
      'O tipo declarado do arquivo não corresponde ao conteúdo da imagem.',
    );
  });

  it('rejects an unsupported image format', async () => {
    const buffer = await sharp({
      create: { width: 64, height: 64, channels: 4, background: '#0057b8' },
    })
      .gif()
      .toBuffer();

    await expect(validateSportsTeamLogoImage(upload(buffer, 'image/gif'))).rejects.toThrow(
      'O logo deve ser uma imagem PNG, JPEG, WebP, AVIF ou SVG.',
    );
  });

  it('rejects dimensions below the minimum', async () => {
    await expect(validateSportsTeamLogoImage(await rasterFile(15, 64))).rejects.toThrow(
      'O logo deve ter ao menos 16px por lado e no máximo 64 megapixels.',
    );
  });

  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><image href="https://example.com/a.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" onclick="x()"/></svg>',
  ])('rejects executable or external SVG content', async (source) => {
    await expect(validateSportsTeamLogoImage(upload(Buffer.from(source), 'image/svg+xml'))).rejects.toThrow(
      'O SVG contém recursos externos ou conteúdo executável.',
    );
  });

  it('accepts a self-contained SVG and normalizes it', async () => {
    const source = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect width="64" height="32" fill="#0057b8"/></svg>',
    );

    await expect(validateSportsTeamLogoImage(upload(source, 'image/svg+xml'))).resolves.toMatchObject({
      mimeType: 'image/avif',
      extension: 'avif',
      width: 64,
      height: 32,
    });
  });
});

async function rasterFile(width: number, height: number): Promise<SportsTeamLogoUploadFile> {
  const buffer = await sharp({ create: { width, height, channels: 4, background: '#0057b8' } })
    .png()
    .toBuffer();
  return upload(buffer, 'image/png');
}

function upload(buffer: Buffer, mimetype: string): SportsTeamLogoUploadFile {
  return { buffer, mimetype, size: buffer.length };
}
