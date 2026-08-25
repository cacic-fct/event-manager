import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { FormElement, FormImage, FormImageReference } from '@cacic-fct/form-contracts';
import { Permission } from '@cacic-fct/shared-permissions';
import { Prisma, PublicationState } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { CurrentUserContextService } from '../current-user/context.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import {
  UploadedEventFormImageFile,
  buildEventFormImageObjectKey,
  convertEventFormImageToAvif,
  toEventFormImageModel,
} from './event-form-image.utils';
import { canPersonAccessLinkPriceTier, canPersonAnswerLink, canPersonViewPublicResults } from './event-form-eligibility';
import { toEventFormModel } from './event-form-model.mapper';
import { arePublicResultsReleasedForLink } from './event-form-results-visibility';
import { eventFormInclude, EventFormRecord } from './event-form-records';
import { isLinkAvailable } from './event-form-targets';

const MAX_IMAGES_PER_DESCRIPTION = 8;
const MAX_IMAGES_PER_FORM = 80;
const MAX_PENDING_IMAGES_PER_USER = 80;

@Injectable()
export class EventFormImagesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventFormImagesService.name);
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly authorizationPolicy: AuthorizationPolicyService,
    private readonly currentUserContext: CurrentUserContextService,
  ) {}

  onModuleInit(): void {
    this.runCleanupSafely();
    this.cleanupTimer = setInterval(() => this.runCleanupSafely(), 6 * 60 * 60 * 1_000);
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  async upload(
    formId: string,
    file: UploadedEventFormImageFile | undefined,
    user: AuthenticatedUser | undefined,
  ): Promise<FormImage> {
    await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Update], { eventFormId: formId });
    const converted = await convertEventFormImageToAvif(file);
    const sha256 = createHash('sha256').update(converted.buffer).digest('hex');
    const duplicate = await this.prisma.eventFormImage.findFirst({
      where: { formId, sha256 },
    });
    if (duplicate) return this.toImage(duplicate);

    const imageId = randomUUID();
    const objectKey = buildEventFormImageObjectKey(formId, imageId);
    const upload = await this.s3.uploadFile(objectKey, converted.buffer, 'image/avif', {
      formId,
      imageId,
      uploadedBy: user?.sub ?? 'unknown',
      originalMimeType: converted.originalMimeType,
    });

    try {
      const image = await this.prisma.eventFormImage.create({
        data: {
          id: imageId,
          formId,
          objectKey: upload.key,
          sha256,
          originalFileName: file?.originalname || 'imagem',
          originalMimeType: converted.originalMimeType,
          mimeType: 'image/avif',
          sizeBytes: upload.size,
          width: converted.width,
          height: converted.height,
          createdById: user?.sub,
        },
      });
      return this.toImage(image);
    } catch (error) {
      await this.deleteObjectBestEffort(upload.key);
      throw error;
    }
  }

  async uploadPending(
    file: UploadedEventFormImageFile | undefined,
    user: AuthenticatedUser | undefined,
    target: { ownerEventId?: string | null; ownerMajorEventId?: string | null },
  ): Promise<FormImage> {
    await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Create], {
      eventId: target.ownerEventId ?? undefined,
      majorEventId: target.ownerMajorEventId ?? undefined,
      allowScopedCollection: true,
    });
    if (!user?.sub) throw new ForbiddenException('Você não pode enviar imagens para este formulário.');
    const pendingCount = await this.prisma.eventFormImage.count({
      where: { formId: null, createdById: user.sub },
    });
    if (pendingCount >= MAX_PENDING_IMAGES_PER_USER) {
      throw new BadRequestException(`Você pode manter no máximo ${MAX_PENDING_IMAGES_PER_USER} imagens pendentes.`);
    }
    const converted = await convertEventFormImageToAvif(file);
    const sha256 = createHash('sha256').update(converted.buffer).digest('hex');
    const duplicate = await this.prisma.eventFormImage.findFirst({
      where: { formId: null, createdById: user.sub, sha256 },
    });
    if (duplicate) return this.toImage(duplicate);

    const imageId = randomUUID();
    const objectKey = `event-forms/pending/${encodeURIComponent(user.sub)}/${imageId}.avif`;
    const upload = await this.s3.uploadFile(objectKey, converted.buffer, 'image/avif', {
      imageId,
      uploadedBy: user.sub,
      originalMimeType: converted.originalMimeType,
    });
    try {
      const image = await this.prisma.eventFormImage.create({
        data: {
          id: imageId,
          objectKey: upload.key,
          sha256,
          originalFileName: file?.originalname || 'imagem',
          originalMimeType: converted.originalMimeType,
          mimeType: 'image/avif',
          sizeBytes: upload.size,
          width: converted.width,
          height: converted.height,
          createdById: user.sub,
        },
      });
      return this.toImage(image);
    } catch (error) {
      await this.deleteObjectBestEffort(upload.key);
      throw error;
    }
  }

  async delete(formId: string, imageId: string, user: AuthenticatedUser | undefined): Promise<void> {
    await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Update], { eventFormId: formId });
    const image = await this.prisma.eventFormImage.findFirst({ where: { id: imageId, formId } });
    if (!image) throw new NotFoundException('Imagem do formulário não encontrada.');
    const [form, drafts] = await Promise.all([
      this.prisma.eventForm.findUnique({
        where: { id: formId },
        select: { descriptionImages: true, elements: true },
      }),
      this.prisma.eventFormDraft.findMany({
        where: { sourceFormId: formId, expiresAt: { gt: new Date() } },
        select: { payload: true },
      }),
    ]);
    const referenced = form ? collectStoredImageIds(form.descriptionImages, form.elements) : new Set<string>();
    for (const draft of drafts) {
      for (const id of collectDraftImageIds(draft.payload)) referenced.add(id);
    }
    if (referenced.has(imageId)) {
      throw new BadRequestException('Remova a imagem do formulário e dos rascunhos antes de excluí-la.');
    }
    await this.prisma.eventFormImage.delete({ where: { id: image.id } });
    await this.deleteObjectBestEffort(image.objectKey);
  }

  async download(
    formId: string,
    imageId: string,
    user: AuthenticatedUser | undefined,
  ): Promise<{ stream: Readable; contentType: string; contentLength?: number }> {
    const image = await this.prisma.eventFormImage.findFirst({
      where: { id: imageId, formId },
      include: { form: { include: eventFormInclude } },
    });
    if (!image?.form || image.form.deletedAt) throw new NotFoundException('Imagem do formulário não encontrada.');
    if (image.form.publicationState === PublicationState.PUBLISHED) {
      await this.assertPublishedFormAccess(image.form, user);
    } else {
      try {
        await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Read], { eventFormId: formId });
      } catch {
        throw new ForbiddenException('Você não pode acessar esta imagem do formulário.');
      }
    }
    const file = await this.s3.downloadFile(image.objectKey);
    return {
      stream: file.stream,
      contentType: file.contentType ?? image.mimeType,
      contentLength: file.contentLength,
    };
  }

  async downloadById(
    imageId: string,
    user: AuthenticatedUser | undefined,
  ): Promise<{ stream: Readable; contentType: string; contentLength?: number }> {
    const image = await this.prisma.eventFormImage.findUnique({
      where: { id: imageId },
      include: { form: { include: eventFormInclude } },
    });
    if (!image) throw new NotFoundException('Imagem do formulário não encontrada.');
    if (!image.formId) {
      if (!user?.sub || image.createdById !== user.sub) throw new ForbiddenException('Você não pode acessar esta imagem.');
    } else if (image.form?.deletedAt) {
      throw new NotFoundException('Imagem do formulário não encontrada.');
    } else if (image.form?.publicationState === PublicationState.PUBLISHED) {
      await this.assertPublishedFormAccess(image.form, user);
    } else {
      await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Read], { eventFormId: image.formId });
    }
    const file = await this.s3.downloadFile(image.objectKey);
    return { stream: file.stream, contentType: file.contentType ?? image.mimeType, contentLength: file.contentLength };
  }

  async reconcile(
    tx: Prisma.TransactionClient,
    formId: string,
    descriptionImages: readonly FormImageReference[],
    elements: readonly FormElement[],
    actorId?: string,
  ): Promise<string[]> {
    const references = this.collectReferences(descriptionImages, elements);
    const referencedIds = new Set(references.map((reference) => reference.id));
    const existing = await tx.eventFormImage.findMany({
      where: { OR: [{ id: { in: [...referencedIds] } }, { formId }] },
      select: { id: true, formId: true, createdById: true, objectKey: true },
    });
    const existingById = new Map(existing.map((image) => [image.id, image]));

    for (const reference of references) {
      const image = existingById.get(reference.id);
      if (!image) {
        throw new BadRequestException('Uma imagem expirou e precisa ser enviada novamente.');
      }
      if (image.formId !== formId && !(image.formId === null && actorId && image.createdById === actorId)) {
        throw new BadRequestException('A referência de imagem do formulário é inválida.');
      }
    }
    if (referencedIds.size) {
      await tx.eventFormImage.updateMany({
        where: {
          id: { in: [...referencedIds] },
          OR: [{ formId }, { formId: null, createdById: actorId }],
        },
        data: { formId, updatedAt: new Date() },
      });
    }
    const activeDrafts = await tx.eventFormDraft.findMany({
      where: { sourceFormId: formId, expiresAt: { gt: new Date() } },
      select: { payload: true },
    });
    const draftReferencedIds = new Set(activeDrafts.flatMap((draft) => [...collectDraftImageIds(draft.payload)]));
    const removed = existing.filter(
      (image) => image.formId === formId && !referencedIds.has(image.id) && !draftReferencedIds.has(image.id),
    );
    if (removed.length) {
      await tx.eventFormImage.deleteMany({
        where: { formId, id: { in: removed.map((image) => image.id) } },
      });
    }
    return removed.map((image) => image.objectKey);
  }

  async deleteObjectsBestEffort(objectKeys: readonly string[]): Promise<void> {
    for (const key of new Set(objectKeys)) await this.deleteObjectBestEffort(key);
  }

  async cleanupUnusedImages(now = new Date()): Promise<number> {
    if (this.cleanupRunning) return 0;
    this.cleanupRunning = true;
    try {
      const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
      let totalCleaned = 0;
      let retainedOffset = 0;
      while (true) {
        const candidates = await this.prisma.eventFormImage.findMany({
          where: { updatedAt: { lt: cutoff } },
          orderBy: { updatedAt: 'asc' },
          skip: retainedOffset,
          take: 200,
        });
        if (!candidates.length) return totalCleaned;

        const formIds = [...new Set(candidates.flatMap((image) => (image.formId ? [image.formId] : [])))];
        const [forms, drafts] = await Promise.all([
          this.prisma.eventForm.findMany({
            where: { id: { in: formIds } },
            select: { id: true, descriptionImages: true, elements: true, deletedAt: true },
          }),
          this.prisma.eventFormDraft.findMany({
            where: { sourceFormId: { in: formIds }, expiresAt: { gt: now } },
            select: { sourceFormId: true, payload: true },
          }),
        ]);
        const referencedByForm = new Map<string, Set<string>>();
        for (const form of forms) {
          if (form.deletedAt) continue;
          referencedByForm.set(form.id, collectStoredImageIds(form.descriptionImages, form.elements));
        }
        for (const draft of drafts) {
          const references = referencedByForm.get(draft.sourceFormId) ?? new Set<string>();
          for (const id of collectDraftImageIds(draft.payload)) references.add(id);
          referencedByForm.set(draft.sourceFormId, references);
        }

        let cleaned = 0;
        let retained = 0;
        for (const image of candidates) {
          if (image.formId && referencedByForm.get(image.formId)?.has(image.id)) {
            retained += 1;
            continue;
          }
          const deleted = await this.prisma.eventFormImage.deleteMany({
            where: { id: image.id, updatedAt: { lt: cutoff } },
          });
          if (!deleted.count) continue;
          await this.deleteObjectBestEffort(image.objectKey);
          cleaned += 1;
        }
        if (cleaned) this.logger.log(`Removed ${cleaned} unused event form image${cleaned === 1 ? '' : 's'}.`);
        totalCleaned += cleaned;
        retainedOffset += retained;
      }
    } finally {
      this.cleanupRunning = false;
    }
  }

  private collectReferences(
    descriptionImages: readonly FormImageReference[],
    elements: readonly FormElement[],
  ): FormImageReference[] {
    const references = this.normalizeReferences(descriptionImages);
    for (const element of elements) {
      references.push(...this.normalizeReferences(element.descriptionImages));
    }
    if (references.length > MAX_IMAGES_PER_FORM) {
      throw new BadRequestException(`Um formulário pode incluir no máximo ${MAX_IMAGES_PER_FORM} imagens.`);
    }
    return references;
  }

  private normalizeReferences(images: readonly FormImageReference[] | undefined): FormImageReference[] {
    if (!images?.length) return [];
    if (images.length > MAX_IMAGES_PER_DESCRIPTION) {
      throw new BadRequestException(`Cada descrição pode incluir no máximo ${MAX_IMAGES_PER_DESCRIPTION} imagens.`);
    }
    if (new Set(images.map((image) => image.id.trim())).size !== images.length) {
      throw new BadRequestException('A mesma imagem não pode ser repetida na mesma descrição.');
    }
    return images.map((image) => {
      const id = image.id.trim();
      if (!id) throw new BadRequestException('O identificador da imagem do formulário é obrigatório.');
      return { id, altText: cleanOptionalText(image.altText) ?? undefined, caption: cleanOptionalText(image.caption) ?? undefined };
    });
  }

  private toImage(image: { id: string; width: number; height: number }): FormImage {
    return toEventFormImageModel(image);
  }

  private runCleanupSafely(): void {
    void this.cleanupUnusedImages().catch((error: unknown) => {
      this.logger.error(
        `Não foi possível limpar imagens de formulários: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  private async assertPublishedFormAccess(form: EventFormRecord, user: AuthenticatedUser | undefined): Promise<void> {
    try {
      await this.authorizationPolicy.assertPermissions(user, [Permission.EventForm.Read], { eventFormId: form.id });
      return;
    } catch {
      // Public access is evaluated below using the same audience rules as form listings.
    }
    if (!user) throw new ForbiddenException('Você não pode acessar esta imagem do formulário.');
    const { person } = await this.currentUserContext.resolveCurrentUserContext(user);
    if (!person) throw new ForbiddenException('Você não pode acessar esta imagem do formulário.');
    const model = toEventFormModel(form);
    for (const link of model.links) {
      if (!isLinkAvailable(link as never)) continue;
      if (await canPersonAnswerLink(this.prisma, person.id, link, { allowFutureSubscriber: true })) {
        return;
      }
      if (!(await canPersonAccessLinkPriceTier(this.prisma, person.id, link))) continue;
      if (
        arePublicResultsReleasedForLink(model, link) &&
        (await canPersonViewPublicResults(this.prisma, person.id, link))
      ) {
        return;
      }
    }
    throw new ForbiddenException('Você não pode acessar esta imagem do formulário.');
  }

  private async deleteObjectBestEffort(objectKey: string): Promise<void> {
    try {
      await this.s3.deleteFile(objectKey);
    } catch (error: unknown) {
      this.logger.warn(`Não foi possível excluir o objeto ${objectKey}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function collectStoredImageIds(descriptionImages: Prisma.JsonValue, elements: Prisma.JsonValue): Set<string> {
  const ids = new Set<string>();
  collectReferenceIds(descriptionImages, ids);
  if (Array.isArray(elements)) {
    for (const element of elements) {
      if (element && typeof element === 'object' && !Array.isArray(element) && 'descriptionImages' in element) {
        collectReferenceIds(element.descriptionImages as Prisma.JsonValue, ids);
      }
    }
  }
  return ids;
}

function collectDraftImageIds(payload: Prisma.JsonValue): Set<string> {
  const ids = new Set<string>();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ids;
  const descriptionImagesJson = payload['descriptionImagesJson'];
  const elementsJson = payload['elementsJson'];
  if (typeof descriptionImagesJson === 'string') {
    try { collectReferenceIds(JSON.parse(descriptionImagesJson) as Prisma.JsonValue, ids); } catch { /* Invalid drafts are ignored. */ }
  }
  if (typeof elementsJson === 'string') {
    try {
      const elements = JSON.parse(elementsJson) as Prisma.JsonValue;
      if (Array.isArray(elements)) {
        for (const element of elements) {
          if (element && typeof element === 'object' && !Array.isArray(element) && 'descriptionImages' in element) {
            collectReferenceIds(element.descriptionImages as Prisma.JsonValue, ids);
          }
        }
      }
    } catch { /* Invalid drafts are ignored. */ }
  }
  return ids;
}

function collectReferenceIds(value: Prisma.JsonValue, ids: Set<string>): void {
  if (!Array.isArray(value)) return;
  for (const reference of value) {
    if (reference && typeof reference === 'object' && !Array.isArray(reference)) {
      const id = reference['id'];
      if (typeof id === 'string' && id.trim()) ids.add(id.trim());
    }
  }
}

export function parseEventFormImageReferences(value: string | null | undefined): FormImageReference[] {
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new BadRequestException('JSON das imagens da descrição do formulário inválido.');
  }
  if (!Array.isArray(parsed)) throw new BadRequestException('As imagens da descrição devem ser uma lista.');
  return parsed.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const id = 'id' in item && typeof item.id === 'string' ? item.id.trim() : '';
    if (!id) return [];
    const altText = 'altText' in item && typeof item.altText === 'string' ? cleanOptionalText(item.altText) : null;
    const caption = 'caption' in item && typeof item.caption === 'string' ? cleanOptionalText(item.caption) : null;
    return [{ id, altText: altText ?? undefined, caption: caption ?? undefined }];
  });
}

function cleanOptionalText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}
