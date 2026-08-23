import { execFile as execFileCallback } from 'child_process';
import { Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';
import { promisify } from 'util';
import {
  MAX_RECEIPT_PDF_PAGES,
  MAX_RECEIPT_PDF_PAGE_PREVIEW_DIMENSION_PIXELS,
  MAX_RECEIPT_PDF_TEXT_BYTES,
  RECEIPT_PDF_PROCESSING_TIMEOUT_MS,
} from '../receipt.types';
import { assertReceiptBufferWithinProcessingLimits } from './receipt-image-processing.utils';

const execFile = promisify(execFileCallback);
const logger = new Logger('ReceiptPdfProcessing');

export class ReceiptPdfProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReceiptPdfProcessingError';
  }
}

export interface ProcessedReceiptPdf {
  text: string;
  previewBuffer: Buffer;
}

export async function assertReceiptPdfPageCountWithinLimit(buffer: Buffer): Promise<void> {
  await withReceiptPdf(buffer, async (inputPath) => {
    assertReceiptPdfPageCount(await readReceiptPdfPageCount(inputPath));
  });
}

export async function processReceiptPdf(buffer: Buffer): Promise<ProcessedReceiptPdf> {
  return withReceiptPdf(buffer, async (inputPath, directory) => {
    const pageCount = await readReceiptPdfPageCount(inputPath);
    assertReceiptPdfPageCount(pageCount);
    const [text, previewBuffer] = await Promise.all([
      extractPdfText(inputPath),
      renderPdfPreview(inputPath, directory, pageCount),
    ]);
    await assertReceiptBufferWithinProcessingLimits(previewBuffer);

    return { text, previewBuffer };
  });
}

export function parseReceiptPdfPageCount(pdfInfo: string): number | undefined {
  const match = /^Pages:\s*(\d+)\s*$/m.exec(pdfInfo);
  const pageCount = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;
  return Number.isSafeInteger(pageCount) && pageCount > 0 ? pageCount : undefined;
}

export function assertReceiptPdfPageCount(pageCount: number): void {
  if (pageCount > MAX_RECEIPT_PDF_PAGES) {
    throw new ReceiptPdfProcessingError(
      `O PDF do comprovante tem ${pageCount} páginas. Envie um arquivo com no máximo ${MAX_RECEIPT_PDF_PAGES} páginas.`,
    );
  }
}

async function withReceiptPdf<T>(buffer: Buffer, operation: (inputPath: string, directory: string) => Promise<T>): Promise<T> {
  const directory = await fs.mkdtemp(join(tmpdir(), 'cacic-receipt-'));
  const inputPath = join(directory, 'receipt.pdf');

  try {
    // codeql[js/http-to-file-access]
    // Uploaded PDFs are written to a private, mkdtemp-created directory for bounded processing.
    await fs.writeFile(inputPath, buffer, { mode: 0o600 });
    return await operation(inputPath, directory);
  } catch (error: unknown) {
    if (error instanceof ReceiptPdfProcessingError) {
      throw error;
    }

    if (isCommandLimitError(error)) {
      throw new ReceiptPdfProcessingError('O processamento do PDF do comprovante excedeu os limites de segurança.');
    }

    throw new ReceiptPdfProcessingError('Não foi possível processar o PDF do comprovante.');
  } finally {
    try {
      await fs.rm(directory, { recursive: true, force: true });
    } catch (error: unknown) {
      // Temporary-file cleanup is best effort. Never replace a successful
      // conversion or the primary processing error with an rm failure.
      logger.warn(
        `Could not clean up temporary receipt PDF directory ${directory}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

async function readReceiptPdfPageCount(inputPath: string): Promise<number> {
  try {
    const { stdout } = await execFile('pdfinfo', ['-f', '1', '-l', (MAX_RECEIPT_PDF_PAGES + 1).toString(), inputPath], {
      timeout: RECEIPT_PDF_PROCESSING_TIMEOUT_MS,
      maxBuffer: 64 * 1024,
      encoding: 'utf8',
    });
    const pageCount = parseReceiptPdfPageCount(stdout);
    if (!pageCount) {
      throw new ReceiptPdfProcessingError('Não foi possível identificar o número de páginas do PDF do comprovante.');
    }

    return pageCount;
  } catch (error: unknown) {
    if (error instanceof ReceiptPdfProcessingError) {
      throw error;
    }

    if (isCommandLimitError(error)) {
      throw new ReceiptPdfProcessingError('A leitura das páginas do PDF do comprovante excedeu os limites de segurança.');
    }

    throw new ReceiptPdfProcessingError('Não foi possível ler as páginas do PDF do comprovante.');
  }
}

async function extractPdfText(inputPath: string): Promise<string> {
  try {
    const { stdout } = await execFile('pdftotext', ['-q', '-enc', 'UTF-8', '-nopgbrk', inputPath, '-'], {
      timeout: RECEIPT_PDF_PROCESSING_TIMEOUT_MS,
      maxBuffer: MAX_RECEIPT_PDF_TEXT_BYTES,
      encoding: 'utf8',
    });
    return stdout.trim();
  } catch (error: unknown) {
    if (isCommandLimitError(error)) {
      throw new ReceiptPdfProcessingError('A extração de texto do PDF do comprovante excedeu os limites de segurança.');
    }

    throw new ReceiptPdfProcessingError('Não foi possível extrair o texto do PDF do comprovante.');
  }
}

async function renderPdfPreview(inputPath: string, directory: string, pageCount: number): Promise<Buffer> {
  const previewPath = join(directory, 'preview');
  try {
    await execFile(
      'pdftoppm',
      [
        '-q',
        '-f',
        '1',
        '-l',
        pageCount.toString(),
        '-scale-to',
        MAX_RECEIPT_PDF_PAGE_PREVIEW_DIMENSION_PIXELS.toString(),
        '-png',
        inputPath,
        previewPath,
      ],
      { timeout: RECEIPT_PDF_PROCESSING_TIMEOUT_MS, maxBuffer: 64 * 1024 },
    );
    const pageFileNames = (await fs.readdir(directory))
      .map((fileName) => ({ fileName, pageNumber: Number.parseInt(/^preview-(\d+)\.png$/.exec(fileName)?.[1] ?? '', 10) }))
      .filter(({ pageNumber }) => Number.isSafeInteger(pageNumber))
      .sort((first, second) => first.pageNumber - second.pageNumber);
    if (pageFileNames.length !== pageCount) {
      throw new ReceiptPdfProcessingError('Não foi possível renderizar todas as páginas do PDF do comprovante.');
    }

    const pageBuffers = await Promise.all(pageFileNames.map(({ fileName }) => fs.readFile(join(directory, fileName))));
    return mergeReceiptPdfPages(pageBuffers);
  } catch (error: unknown) {
    if (error instanceof ReceiptPdfProcessingError) {
      throw error;
    }

    if (isCommandLimitError(error)) {
      throw new ReceiptPdfProcessingError('A pré-visualização do PDF do comprovante excedeu os limites de segurança.');
    }

    throw new ReceiptPdfProcessingError('Não foi possível gerar a pré-visualização do PDF do comprovante.');
  }
}

async function mergeReceiptPdfPages(pageBuffers: Buffer[]): Promise<Buffer> {
  const pageMetadata = await Promise.all(pageBuffers.map((page) => sharp(page).metadata()));
  const pageWidth = Math.max(...pageMetadata.map((metadata) => metadata.width ?? 0));
  const pageHeight = Math.max(...pageMetadata.map((metadata) => metadata.height ?? 0));
  if (!pageWidth || !pageHeight) {
    throw new ReceiptPdfProcessingError('Não foi possível determinar o tamanho das páginas do PDF do comprovante.');
  }

  const columns = pageBuffers.length === 1 ? 1 : 2;
  const rows = Math.ceil(pageBuffers.length / columns);
  return sharp({
    create: {
      width: pageWidth * columns,
      height: pageHeight * rows,
      channels: 3,
      background: '#ffffff',
    },
  })
    .composite(
      pageBuffers.map((input, index) => ({
        input,
        left: (index % columns) * pageWidth,
        top: Math.floor(index / columns) * pageHeight,
      })),
    )
    .png({ adaptiveFiltering: true, compressionLevel: 9 })
    .toBuffer();
}

function isCommandLimitError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.toLowerCase().includes('maxbuffer') || error.message.toLowerCase().includes('timed out'))
  );
}
