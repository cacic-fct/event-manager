import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  cleanLegacyEventShortDescription,
  convertLegacyEventDescription,
} from './legacy-event-description-converter';

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 1_000;

interface ConversionOptions {
  apply: boolean;
  batchSize: number;
}

interface ConversionSummary {
  scanned: number;
  candidates: number;
  updated: number;
  concurrentlyChanged: number;
}

function parsePositiveInteger(value: string | undefined, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_BATCH_SIZE) {
    throw new Error(`${option} must be an integer between 1 and ${MAX_BATCH_SIZE}.`);
  }
  return parsed;
}

export function parseLegacyEventDescriptionConversionOptions(args: string[]): ConversionOptions {
  let apply = false;
  let batchSize = DEFAULT_BATCH_SIZE;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--apply') {
      apply = true;
      continue;
    }
    if (argument === '--batch-size') {
      batchSize = parsePositiveInteger(args[index + 1], '--batch-size');
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }

  return { apply, batchSize };
}

export async function convertLegacyEventDescriptionsCommand(args: string[]): Promise<void> {
  const options = parseLegacyEventDescriptionConversionOptions(args);
  const prisma = new PrismaService();
  const summary: ConversionSummary = {
    scanned: 0,
    candidates: 0,
    updated: 0,
    concurrentlyChanged: 0,
  };
  let cursor: string | undefined;

  Logger.log(
    `Legacy event description conversion started in ${options.apply ? 'APPLY' : 'DRY-RUN'} mode.`,
  );

  try {
    await prisma.$connect();

    while (true) {
      const events = await prisma.event.findMany({
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
        select: { id: true, description: true, shortDescription: true },
        take: options.batchSize,
      });
      if (events.length === 0) {
        break;
      }

      for (const event of events) {
        summary.scanned += 1;
        const description = convertLegacyEventDescription(event.description);
        const shortDescription = cleanLegacyEventShortDescription(event.shortDescription);
        if (description === event.description && shortDescription === event.shortDescription) {
          continue;
        }

        summary.candidates += 1;
        if (!options.apply) {
          continue;
        }

        const result = await prisma.event.updateMany({
          where: {
            id: event.id,
            description: event.description,
            shortDescription: event.shortDescription,
          },
          data: { description, shortDescription },
        });
        if (result.count === 1) {
          summary.updated += 1;
        } else {
          summary.concurrentlyChanged += 1;
        }
      }

      cursor = events.at(-1)?.id;
    }
  } finally {
    await prisma.$disconnect();
  }

  Logger.log(
    `Legacy event description conversion finished: scanned=${summary.scanned}, candidates=${summary.candidates}, updated=${summary.updated}, concurrentlyChanged=${summary.concurrentlyChanged}.`,
  );
  if (!options.apply && summary.candidates > 0) {
    Logger.log('No rows were changed. Run the same command with --apply to persist conversions.');
  }
}
