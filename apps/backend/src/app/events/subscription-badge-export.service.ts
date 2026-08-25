import { BadRequestException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toBuffer, toSVG } from '@bwip-js/node';
import { Readable } from 'node:stream';
import {
  isValidCpf,
  isValidErrorCorrectionLevel,
  subscriberCsvHeader,
  subscriberCsvRow,
  type IdentityDocumentExportMode,
  type SubscriberCsvField,
} from '@cacic-fct/shared-utils';
import { PrismaService } from '../prisma/prisma.service';
import { createZipArchive, type ZipArchiveStream } from '../shared/zip-archive';

const EXPORT_PAGE_SIZE = 500;
const BADGE_CODE_PATH_CSV_HEADER = 'Caminho relativo do código Aztec';
const SUPPORTED_FIELDS = new Set<SubscriberCsvField>([
  'fullName',
  'email',
  'identityDocument',
  'enrollmentNumber',
  'unespRole',
  'phone',
]);

export type SubscriberBadgeCodeFormat = 'svg' | 'png';
export type SubscriberBadgeCodeFileName = 'id' | 'fullName' | 'identityDocument';

export interface SubscriberBadgeExportInput {
  fields: SubscriberCsvField[];
  identityDocumentMode: IdentityDocumentExportMode;
  errorCorrectionLevel: string;
  format: SubscriberBadgeCodeFormat;
  fileName: SubscriberBadgeCodeFileName;
}

type ExportPerson = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  identityDocument: string | null;
  academicId: string | null;
  userId: string | null;
  user: { role: string | null } | null;
};

type ExportTarget =
  | { kind: 'event'; eventId: string; name: string }
  | { kind: 'majorEvent'; majorEventId: string; name: string };

type BadgeCodePathContext = {
  people: readonly ExportPerson[];
  duplicateFullNameStems: ReadonlySet<string>;
};

type ExportPage = {
  people: ExportPerson[];
  lastCreatedAt: Date;
  lastId: string;
};

@Injectable()
export class SubscriptionBadgeExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportEvent(eventId: string, input: SubscriberBadgeExportInput): Promise<SubscriptionBadgeExport> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!event) {
      throw new NotFoundException('Evento não encontrado.');
    }

    const target: ExportTarget = { kind: 'event', eventId: event.id, name: event.name };
    const normalizedInput = this.normalizeInput(input);
    const codePathContext = await this.createBadgeCodePathContext(target, normalizedInput);
    this.assertBadgeExportPreconditions(normalizedInput, codePathContext);
    return this.createArchive(target, normalizedInput, codePathContext);
  }

  async exportMajorEvent(majorEventId: string, input: SubscriberBadgeExportInput): Promise<SubscriptionBadgeExport> {
    const majorEvent = await this.prisma.majorEvent.findFirst({
      where: { id: majorEventId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!majorEvent) {
      throw new NotFoundException('Grande evento não encontrado.');
    }

    const target: ExportTarget = { kind: 'majorEvent', majorEventId: majorEvent.id, name: majorEvent.name };
    const normalizedInput = this.normalizeInput(input);
    const codePathContext = await this.createBadgeCodePathContext(target, normalizedInput);
    this.assertBadgeExportPreconditions(normalizedInput, codePathContext);
    return this.createArchive(target, normalizedInput, codePathContext);
  }

  private async createArchive(
    target: ExportTarget,
    input: SubscriberBadgeExportInput,
    codePathContext: BadgeCodePathContext,
  ): Promise<SubscriptionBadgeExport> {
    const archive = await createZipArchive();
    archive.on('warning', (error: { code: string } & Error) => {
      if (error.code !== 'ENOENT') {
        archive.destroy(error);
      }
    });
    archive.on('error', (error: Error) => archive.destroy(error));

    archive.append(this.createCsvStream(input, codePathContext), { name: 'inscricoes.csv' });
    void this.appendBadgeCodes(archive, input, codePathContext)
      .then(() => archive.finalize())
      .catch((error: unknown) => archive.destroy(asError(error)));

    return {
      file: new StreamableFile(archive),
      fileName: `${formatExportTimestamp(new Date())}-${slugify(target.name)}.zip`,
    };
  }

  private createCsvStream(input: SubscriberBadgeExportInput, codePathContext: BadgeCodePathContext): Readable {
    return Readable.from(this.csvChunks(input, codePathContext));
  }

  private async *csvChunks(
    input: SubscriberBadgeExportInput,
    codePathContext: BadgeCodePathContext,
  ): AsyncGenerator<string> {
    const resolveCodePath = createBadgeCodePathResolver(input, codePathContext);
    yield `\uFEFF${subscriberCsvHeader(input, [BADGE_CODE_PATH_CSV_HEADER])}\r\n`;

    for (const person of codePathContext.people) {
      yield `${subscriberCsvRow(person, input, [resolveCodePath(person)])}\r\n`;
    }
  }

  private async appendBadgeCodes(
    archive: ZipArchiveStream,
    input: SubscriberBadgeExportInput,
    codePathContext: BadgeCodePathContext,
  ): Promise<void> {
    const resolveCodePath = createBadgeCodePathResolver(input, codePathContext);
    for (const person of codePathContext.people) {
      const code = await this.renderBadgeCode(`user:${person.userId}`, input);
      archive.append(code, { name: resolveCodePath(person) });
    }
  }

  private assertBadgeExportPreconditions(
    input: SubscriberBadgeExportInput,
    codePathContext: BadgeCodePathContext,
  ): void {
    for (const person of codePathContext.people) {
      if (!person.userId) {
        throw new BadRequestException(
          `Não foi possível gerar o código de crachá para ${person.name}: a pessoa não possui uma conta de usuário.`,
        );
      }
      if (
        (input.fileName === 'identityDocument' ||
          (input.fileName === 'fullName' && codePathContext.duplicateFullNameStems.has(slugify(person.name)))) &&
        !person.identityDocument?.trim()
      ) {
        throw new BadRequestException(`Não foi possível nomear o código de ${person.name}: documento não informado.`);
      }
    }
  }

  private async createBadgeCodePathContext(
    target: ExportTarget,
    input: SubscriberBadgeExportInput,
  ): Promise<BadgeCodePathContext> {
    const people = await this.findPeople(target);
    if (input.fileName !== 'fullName') {
      return { people, duplicateFullNameStems: new Set() };
    }

    const counts = new Map<string, number>();
    for (const person of people) {
      const stem = slugify(person.name);
      counts.set(stem, (counts.get(stem) ?? 0) + 1);
    }

    return {
      people,
      duplicateFullNameStems: new Set([...counts].flatMap(([stem, count]) => (count > 1 ? [stem] : []))),
    };
  }

  private async findPeople(target: ExportTarget): Promise<ExportPerson[]> {
    const people: ExportPerson[] = [];
    for await (const page of this.peoplePages(target)) {
      people.push(...page);
    }
    return people;
  }

  private async *peoplePages(target: ExportTarget): AsyncGenerator<ExportPerson[]> {
    let cursor: { createdAt: Date; id: string } | undefined;
    for (;;) {
      const page = await this.findPeoplePage(target, cursor);
      if (page.people.length === 0) {
        return;
      }

      yield page.people;
      if (page.people.length < EXPORT_PAGE_SIZE) {
        return;
      }
      cursor = { createdAt: page.lastCreatedAt, id: page.lastId };
    }
  }

  private findPeoplePage(target: ExportTarget, cursor?: { createdAt: Date; id: string }): Promise<ExportPage> {
    const eventSubscriptionSelect = {
      id: true,
      createdAt: true,
      person: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          identityDocument: true,
          academicId: true,
          userId: true,
          user: {
            select: {
              role: true,
            },
          },
        },
      },
    } satisfies Prisma.EventSubscriptionSelect;

    if (target.kind === 'event') {
      return this.prisma.eventSubscription
        .findMany({
          where: {
            eventId: target.eventId,
            deletedAt: null,
            ...(cursor
              ? {
                  OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }],
                }
              : {}),
          },
          select: eventSubscriptionSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: EXPORT_PAGE_SIZE,
        })
        .then((subscriptions) => ({
          people: subscriptions.map((subscription) => subscription.person),
          lastCreatedAt: subscriptions.at(-1)?.createdAt ?? new Date(0),
          lastId: subscriptions.at(-1)?.id ?? '',
        }));
    }

    const majorEventSubscriptionSelect = {
      id: true,
      createdAt: true,
      person: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          identityDocument: true,
          academicId: true,
          userId: true,
          user: {
            select: {
              role: true,
            },
          },
        },
      },
    } satisfies Prisma.MajorEventSubscriptionSelect;

    return this.prisma.majorEventSubscription
      .findMany({
        where: {
          majorEventId: target.majorEventId,
          deletedAt: null,
          ...(cursor
            ? {
                OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }],
              }
            : {}),
        },
        select: majorEventSubscriptionSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: EXPORT_PAGE_SIZE,
      })
      .then((subscriptions) => ({
        people: subscriptions.map((subscription) => subscription.person),
        lastCreatedAt: subscriptions.at(-1)?.createdAt ?? new Date(0),
        lastId: subscriptions.at(-1)?.id ?? '',
      }));
  }

  private async renderBadgeCode(value: string, input: SubscriberBadgeExportInput): Promise<Buffer | string> {
    const options = {
      bcid: 'azteccode' as const,
      text: value,
      height: 300,
      width: 300,
      includetext: false,
      textxalign: 'center' as const,
      eclevel: Number(input.errorCorrectionLevel),
    };

    return input.format === 'svg' ? toSVG(options) : toBuffer(options);
  }

  private normalizeInput(input: SubscriberBadgeExportInput): SubscriberBadgeExportInput {
    const fields = input.fields?.filter((field): field is SubscriberCsvField => SUPPORTED_FIELDS.has(field)) ?? [];
    if (fields.length === 0 || fields.length !== input.fields.length) {
      throw new BadRequestException('Selecione pelo menos uma coluna válida para o CSV.');
    }
    if (input.identityDocumentMode !== 'masked' && input.identityDocumentMode !== 'complete') {
      throw new BadRequestException('Formato de documento inválido.');
    }
    if (input.format !== 'svg' && input.format !== 'png') {
      throw new BadRequestException('Formato de código inválido.');
    }
    if (!['id', 'fullName', 'identityDocument'].includes(input.fileName)) {
      throw new BadRequestException('Opção de nome de arquivo inválida.');
    }
    if (!isValidErrorCorrectionLevel(input.errorCorrectionLevel)) {
      throw new BadRequestException('O nível de correção de erros deve ser um inteiro entre 5 e 95.');
    }

    return { ...input, fields };
  }
}

export interface SubscriptionBadgeExport {
  file: StreamableFile;
  fileName: string;
}

function createBadgeCodePathResolver(
  input: Pick<SubscriberBadgeExportInput, 'fileName' | 'format'>,
  context: BadgeCodePathContext,
): (person: ExportPerson) => string {
  const filenames = new Map<string, number>();

  return (person) => buildBadgeCodeRelativePath(person, input, context.duplicateFullNameStems, filenames);
}

export function buildBadgeCodeRelativePath(
  person: Pick<ExportPerson, 'id' | 'name' | 'identityDocument'>,
  input: Pick<SubscriberBadgeExportInput, 'fileName' | 'format'>,
  duplicateFullNameStems: ReadonlySet<string>,
  seen: Map<string, number>,
): string {
  const fileBaseName = badgeFileBaseName(person, input.fileName, duplicateFullNameStems);
  return `codigos/${uniqueFileName(fileBaseName, seen)}.${input.format}`;
}

function badgeFileBaseName(
  person: Pick<ExportPerson, 'id' | 'name' | 'identityDocument'>,
  mode: SubscriberBadgeCodeFileName,
  duplicateFullNameStems: ReadonlySet<string>,
): string {
  if (mode === 'id') {
    return person.id;
  }

  if (mode === 'identityDocument') {
    return normalizedIdentityDocumentForFileName(person);
  }

  const fullName = slugify(person.name);
  return duplicateFullNameStems.has(fullName)
    ? `${fullName}-${normalizedIdentityDocumentForFileName(person)}`
    : fullName;
}

function normalizedIdentityDocumentForFileName(person: Pick<ExportPerson, 'name' | 'identityDocument'>): string {
  const identityDocument = person.identityDocument?.trim();
  if (!identityDocument) {
    throw new BadRequestException(`Não foi possível nomear o código de ${person.name}: documento não informado.`);
  }

  return isValidCpf(identityDocument) ? identityDocument.replace(/\D/g, '') : sanitizeFileName(identityDocument);
}

function uniqueFileName(value: string, seen: Map<string, number>): string {
  const normalized = value || 'codigo';
  const count = seen.get(normalized) ?? 0;
  seen.set(normalized, count + 1);
  return count === 0 ? normalized : `${normalized}-${count + 1}`;
}

function formatExportTimestamp(date: Date): string {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()]
    .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, '0')))
    .join('-');
}

function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'evento'
  );
}

function sanitizeFileName(value: string): string {
  return [...value]
    .map((character) => (character === '\\' || character === '/' || character.charCodeAt(0) < 32 ? '-' : character))
    .join('');
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Não foi possível gerar o arquivo de códigos para crachá.');
}
