import {
  CertificateConfig,
  CertificateConfigCreateInput,
  CertificateConfigUpdateInput,
  CertificateFolder,
  CertificateFolderCreateInput,
  CertificateFolderUpdateInput,
  CertificateIssuedTo,
  CertificateScope,
  CertificateTemplate,
  DeletionResult,
} from '@cacic-fct/shared-data-types';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import {
  CERTIFICATE_FOLDER_SELECT,
  CERTIFICATE_CONFIG_SELECT,
  CERTIFICATE_TEMPLATE_SELECT,
  buildConfigTargetWhere,
  mapCertificateFolder,
  mapCertificateConfig,
  mapCertificateTemplate,
} from './certificate.constants';
import { CertificateTargetsService } from './certificate-targets.service';
import { CertificateValidationService } from './certificate-validation.service';

const LECTURER_EVENT_CATEGORY_FIELD = '__lecturerEventCategory';
type LecturerEventCategory = 'PALESTRA' | 'MINICURSO' | 'OTHER';

@Injectable()
export class CertificateConfigsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: CertificateValidationService,
    private readonly targetsService: CertificateTargetsService,
    private readonly typesenseSearch: TypesenseSearchService = {
      isEnabled: () => false,
      searchCertificateTemplates: async () => ({ available: false, ids: [] }),
    } as unknown as TypesenseSearchService,
  ) {}

  async listFolders(query?: string, skip?: number, take?: number): Promise<CertificateFolder[]> {
    const normalizedQuery = query?.trim();
    const folders = await this.prisma.certificateFolder.findMany({
      where: {
        deletedAt: null,
        ...(normalizedQuery
          ? {
              name: {
                contains: normalizedQuery,
                mode: 'insensitive',
              },
            }
          : {}),
      },
      select: CERTIFICATE_FOLDER_SELECT,
      orderBy: {
        name: 'asc',
      },
      skip,
      take,
    });

    return folders.map(mapCertificateFolder);
  }

  async getFolderById(folderId: string): Promise<CertificateFolder> {
    const normalizedFolderId = this.validation.normalizeRequiredId('folderId', folderId);
    const folder = await this.prisma.certificateFolder.findFirst({
      where: {
        id: normalizedFolderId,
        deletedAt: null,
      },
      select: CERTIFICATE_FOLDER_SELECT,
    });

    if (!folder) {
      throw new NotFoundException(`Certificate folder ${normalizedFolderId} not found.`);
    }

    return mapCertificateFolder(folder);
  }

  async createFolder(input: CertificateFolderCreateInput): Promise<CertificateFolder> {
    const name = this.normalizeFolderName(input.name);
    const emoji = this.normalizeFolderEmoji(input.emoji);
    await this.ensureNoDuplicateFolderName(name);

    const folder = await this.prisma.certificateFolder.create({
      data: {
        name,
        emoji,
      },
      select: CERTIFICATE_FOLDER_SELECT,
    });

    return mapCertificateFolder(folder);
  }

  async updateFolder(folderId: string, input: CertificateFolderUpdateInput): Promise<CertificateFolder> {
    const normalizedFolderId = this.validation.normalizeRequiredId('folderId', folderId);
    const existingFolder = await this.prisma.certificateFolder.findFirst({
      where: {
        id: normalizedFolderId,
        deletedAt: null,
      },
      select: CERTIFICATE_FOLDER_SELECT,
    });

    if (!existingFolder) {
      throw new NotFoundException(`Certificate folder ${normalizedFolderId} not found.`);
    }

    const name = input.name === undefined ? existingFolder.name : this.normalizeFolderName(input.name);
    const emoji = input.emoji === undefined ? existingFolder.emoji : this.normalizeFolderEmoji(input.emoji);

    await this.ensureNoDuplicateFolderName(name, normalizedFolderId);

    const updatedFolder = await this.prisma.certificateFolder.update({
      where: {
        id: normalizedFolderId,
      },
      data: {
        ...(input.name === undefined ? {} : { name }),
        ...(input.emoji === undefined ? {} : { emoji }),
      },
      select: CERTIFICATE_FOLDER_SELECT,
    });

    return mapCertificateFolder(updatedFolder);
  }

  async listTemplates(
    query?: string,
    includeInactive?: boolean,
    skip?: number,
    take?: number,
  ): Promise<CertificateTemplate[]> {
    const normalizedQuery = query?.trim();
    const where: Prisma.CertificateTemplateWhereInput = {
      deletedAt: null,
      ...(includeInactive ? {} : { isActive: true }),
    };

    let prioritizedIds: string[] = [];
    if (normalizedQuery) {
      if (this.typesenseSearch.isEnabled()) {
        const searchResult = await this.typesenseSearch.searchCertificateTemplates(
          normalizedQuery,
          {
            filterBy: includeInactive ? undefined : 'isActive:=true',
            limit: take ?? 50,
            offset: skip ?? 0,
          },
        );
        if (searchResult.available) {
          prioritizedIds = searchResult.ids;
          if (prioritizedIds.length === 0) {
            return [];
          }
          where.id = { in: prioritizedIds };
        } else {
          where.name = {
            contains: normalizedQuery,
            mode: 'insensitive',
          };
        }
      } else {
        where.name = {
          contains: normalizedQuery,
          mode: 'insensitive',
        };
      }
    }

    const templates = await this.prisma.certificateTemplate.findMany({
      where,
      select: CERTIFICATE_TEMPLATE_SELECT,
      orderBy: {
        name: 'asc',
      },
      skip: prioritizedIds.length > 0 ? 0 : skip,
      take: prioritizedIds.length > 0 ? prioritizedIds.length : take,
    });

    if (prioritizedIds.length === 0) {
      return templates.map(mapCertificateTemplate);
    }

    const rank = new Map(prioritizedIds.map((id, index) => [id, index]));
    return [...templates]
      .sort(
        (left, right) =>
          (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      )
      .map(mapCertificateTemplate);
  }

  async listConfigsByTarget(
    scope: CertificateScope,
    targetId: string,
    includeInactive = true,
    skip?: number,
    take?: number,
  ): Promise<CertificateConfig[]> {
    this.validation.assertSupportedScope(scope);
    const normalizedTargetId = this.validation.normalizeRequiredId('targetId', targetId);

    const configs = await this.prisma.certificateConfig.findMany({
      where: {
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
        ...buildConfigTargetWhere(scope, normalizedTargetId),
      },
      select: CERTIFICATE_CONFIG_SELECT,
      orderBy: {
        updatedAt: 'desc',
      },
      skip,
      take,
    });

    return configs.map(mapCertificateConfig);
  }

  async getConfigById(configId: string): Promise<CertificateConfig> {
    const normalizedConfigId = this.validation.normalizeRequiredId('configId', configId);
    const config = await this.prisma.certificateConfig.findFirst({
      where: {
        id: normalizedConfigId,
        deletedAt: null,
      },
      select: CERTIFICATE_CONFIG_SELECT,
    });

    if (!config) {
      throw new NotFoundException(`Certificate config ${normalizedConfigId} not found.`);
    }

    return mapCertificateConfig(config);
  }

  async createConfig(input: CertificateConfigCreateInput): Promise<CertificateConfig> {
    const scope = input.scope;
    const majorEventId = this.validation.normalizeOptionalId(input.majorEventId);
    const eventGroupId = this.validation.normalizeOptionalId(input.eventGroupId);
    const eventId = this.validation.normalizeOptionalId(input.eventId);
    const folderId = this.validation.normalizeOptionalId(input.folderId);
    const name = this.validation.normalizeRequiredName(input.name);
    const templateId = this.validation.normalizeRequiredId('certificateTemplateId', input.certificateTemplateId);
    const certificateText = this.validation.normalizeOptionalText(input.certificateText);
    const secondPageText = this.validation.normalizeOptionalText(input.secondPageText);
    const certificateFields = this.validation.normalizeCertificateFieldsJson(input.certificateFieldsJson);
    this.assertStandaloneIssuedTo(scope, input.issuedTo);
    const issuedTo = scope === CertificateScope.OTHER ? CertificateIssuedTo.OTHER : (input.issuedTo ?? CertificateIssuedTo.ATTENDEE);
    const certificateTypeLabel = this.resolveCertificateTypeLabel(
      issuedTo,
      certificateFields === undefined ? null : certificateFields,
      input.certificateTypeLabel,
    );

    this.validation.assertScopeTargetConsistency(scope, {
      majorEventId,
      eventGroupId,
      eventId,
    });
    this.assertFolderTargetConsistency(scope, folderId);
    const targetId = this.resolveTargetId(scope, {
      majorEventId,
      eventGroupId,
      eventId,
      folderId,
    });

    await this.ensureTemplateExists(templateId);
    if (scope === CertificateScope.OTHER) {
      await this.ensureFolderExists(targetId);
    } else {
      await this.targetsService.assertIssuableTarget(scope, targetId);
    }
    await this.ensureNoDuplicateName(scope, targetId, name);

    const createdConfig = await this.prisma.certificateConfig.create({
      data: {
        name,
        scope,
        majorEventId: majorEventId ?? null,
        eventGroupId: eventGroupId ?? null,
        eventId: eventId ?? null,
        folderId: scope === CertificateScope.OTHER ? targetId : null,
        certificateTemplateId: templateId,
        certificateText: certificateText === undefined ? undefined : certificateText,
        shouldAutofillSecondPage: input.shouldAutofillSecondPage ?? scope !== CertificateScope.OTHER,
        secondPageText: secondPageText === undefined ? undefined : secondPageText,
        isActive: input.isActive ?? true,
        issuedTo,
        certificateTypeLabel,
        ...(certificateFields === undefined
          ? {}
          : certificateFields === null
            ? { certificateFields: Prisma.DbNull }
            : { certificateFields }),
      },
      select: CERTIFICATE_CONFIG_SELECT,
    });

    return mapCertificateConfig(createdConfig);
  }

  async updateConfig(configId: string, input: CertificateConfigUpdateInput): Promise<CertificateConfig> {
    const normalizedConfigId = this.validation.normalizeRequiredId('configId', configId);
    const existingConfig = await this.prisma.certificateConfig.findFirst({
      where: {
        id: normalizedConfigId,
        deletedAt: null,
      },
      select: CERTIFICATE_CONFIG_SELECT,
    });

    if (!existingConfig) {
      throw new NotFoundException(`Certificate config ${normalizedConfigId} not found.`);
    }

    const mergedScope = input.scope ?? existingConfig.scope;
    const mergedMajorEventId =
      input.majorEventId === undefined
        ? existingConfig.majorEventId
        : (this.validation.normalizeOptionalId(input.majorEventId) ?? null);
    const mergedEventGroupId =
      input.eventGroupId === undefined
        ? existingConfig.eventGroupId
        : (this.validation.normalizeOptionalId(input.eventGroupId) ?? null);
    const mergedEventId =
      input.eventId === undefined
        ? existingConfig.eventId
        : (this.validation.normalizeOptionalId(input.eventId) ?? null);
    const mergedFolderId =
      mergedScope === CertificateScope.OTHER
        ? input.folderId === undefined
          ? existingConfig.folderId
          : (this.validation.normalizeOptionalId(input.folderId) ?? null)
        : null;
    const mergedName =
      input.name === undefined ? existingConfig.name : this.validation.normalizeRequiredName(input.name);
    const mergedTemplateId =
      input.certificateTemplateId === undefined
        ? existingConfig.certificateTemplateId
        : this.validation.normalizeRequiredId('certificateTemplateId', input.certificateTemplateId);

    this.validation.assertScopeTargetConsistency(mergedScope, {
      majorEventId: mergedMajorEventId,
      eventGroupId: mergedEventGroupId,
      eventId: mergedEventId,
    });
    this.assertFolderTargetConsistency(mergedScope, mergedFolderId);
    const mergedTargetId = this.resolveTargetId(mergedScope, {
      majorEventId: mergedMajorEventId,
      eventGroupId: mergedEventGroupId,
      eventId: mergedEventId,
      folderId: mergedFolderId,
    });

    await this.ensureTemplateExists(mergedTemplateId);
    if (mergedScope === CertificateScope.OTHER) {
      await this.ensureFolderExists(mergedTargetId);
    } else {
      await this.targetsService.assertIssuableTarget(mergedScope, mergedTargetId);
    }
    await this.ensureNoDuplicateName(mergedScope, mergedTargetId, mergedName, normalizedConfigId);

    const nextText =
      input.certificateText === undefined ? undefined : this.validation.normalizeOptionalText(input.certificateText);
    const nextSecondPageText =
      input.secondPageText === undefined ? undefined : this.validation.normalizeOptionalText(input.secondPageText);
    const nextCertificateFields =
      input.certificateFieldsJson === undefined
        ? undefined
        : this.validation.normalizeCertificateFieldsJson(input.certificateFieldsJson);
    this.assertStandaloneIssuedTo(mergedScope, input.issuedTo);
    const nextIssuedTo = input.issuedTo;
    const mergedIssuedTo = mergedScope === CertificateScope.OTHER ? CertificateIssuedTo.OTHER : (nextIssuedTo ?? existingConfig.issuedTo);
    const mergedCertificateFields =
      nextCertificateFields === undefined
        ? existingConfig.certificateFields
        : nextCertificateFields === null
          ? null
          : nextCertificateFields;
    const nextCertificateTypeLabel =
      input.certificateTypeLabel !== undefined || nextIssuedTo !== undefined || nextCertificateFields !== undefined
        ? this.resolveCertificateTypeLabel(mergedIssuedTo, mergedCertificateFields, input.certificateTypeLabel)
        : undefined;

    const shouldUpdateScopeOrTargets =
      input.scope !== undefined ||
      input.majorEventId !== undefined ||
      input.eventGroupId !== undefined ||
      input.eventId !== undefined ||
      input.folderId !== undefined;

    const data: Prisma.CertificateConfigUpdateInput = {
      ...(input.name === undefined ? {} : { name: mergedName }),
      ...(shouldUpdateScopeOrTargets
        ? {
            scope: mergedScope,
            majorEventId: mergedMajorEventId,
            eventGroupId: mergedEventGroupId,
            eventId: mergedEventId,
            folderId: mergedFolderId,
          }
        : {}),
      ...(input.certificateTemplateId === undefined ? {} : { certificateTemplateId: mergedTemplateId }),
      ...(nextText === undefined ? {} : { certificateText: nextText }),
      ...(input.shouldAutofillSecondPage === undefined
        ? {}
        : { shouldAutofillSecondPage: input.shouldAutofillSecondPage }),
      ...(nextSecondPageText === undefined ? {} : { secondPageText: nextSecondPageText }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(nextIssuedTo === undefined && mergedScope !== CertificateScope.OTHER ? {} : { issuedTo: mergedIssuedTo }),
      ...(nextCertificateTypeLabel === undefined ? {} : { certificateTypeLabel: nextCertificateTypeLabel }),
      ...(nextCertificateFields === undefined
        ? {}
        : nextCertificateFields === null
          ? { certificateFields: Prisma.DbNull }
          : { certificateFields: nextCertificateFields }),
    };

    if (Object.keys(data).length === 0) {
      return mapCertificateConfig(existingConfig);
    }

    const updatedConfig = await this.prisma.certificateConfig.update({
      where: {
        id: normalizedConfigId,
      },
      data,
      select: CERTIFICATE_CONFIG_SELECT,
    });

    return mapCertificateConfig(updatedConfig);
  }

  async deleteConfig(configId: string): Promise<DeletionResult> {
    const normalizedConfigId = this.validation.normalizeRequiredId('configId', configId);
    const { count } = await this.prisma.certificateConfig.updateMany({
      where: {
        id: normalizedConfigId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    if (count === 0) {
      throw new NotFoundException(`Certificate config ${normalizedConfigId} not found.`);
    }

    await this.prisma.certificate.updateMany({
      where: {
        configId: normalizedConfigId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return {
      deleted: true,
      id: normalizedConfigId,
    };
  }

  private async ensureTemplateExists(templateId: string): Promise<void> {
    const template = await this.prisma.certificateTemplate.findFirst({
      where: {
        id: templateId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!template) {
      throw new NotFoundException(`Certificate template ${templateId} not found.`);
    }
  }

  private async ensureFolderExists(folderId: string): Promise<void> {
    const folder = await this.prisma.certificateFolder.findFirst({
      where: {
        id: folderId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!folder) {
      throw new NotFoundException(`Certificate folder ${folderId} not found.`);
    }
  }

  private async ensureNoDuplicateFolderName(name: string, excludeId?: string): Promise<void> {
    const duplicate = await this.prisma.certificateFolder.findFirst({
      where: {
        deletedAt: null,
        name: {
          equals: name,
          mode: 'insensitive',
        },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: {
        id: true,
      },
    });

    if (duplicate) {
      throw new ConflictException(`A certificate folder named "${name}" already exists.`);
    }
  }

  private resolveTargetId(
    scope: CertificateScope,
    targets: {
      majorEventId?: string | null;
      eventGroupId?: string | null;
      eventId?: string | null;
      folderId?: string | null;
    },
  ): string {
    if (scope === CertificateScope.MAJOR_EVENT && targets.majorEventId) {
      return targets.majorEventId;
    }

    if (scope === CertificateScope.EVENT_GROUP && targets.eventGroupId) {
      return targets.eventGroupId;
    }

    if (scope === CertificateScope.EVENT && targets.eventId) {
      return targets.eventId;
    }

    if (scope === CertificateScope.OTHER && targets.folderId) {
      return targets.folderId;
    }

    throw new BadRequestException(`Missing target id for scope ${scope}.`);
  }

  private assertFolderTargetConsistency(scope: CertificateScope, folderId?: string | null): void {
    if (scope === CertificateScope.OTHER) {
      if (!folderId) {
        throw new BadRequestException('OTHER scope requires folderId.');
      }
      return;
    }

    if (folderId) {
      throw new BadRequestException('folderId is only supported for OTHER scope.');
    }
  }

  private assertStandaloneIssuedTo(scope: CertificateScope, issuedTo?: CertificateIssuedTo | null): void {
    if (scope === CertificateScope.OTHER && issuedTo && issuedTo !== CertificateIssuedTo.OTHER) {
      throw new BadRequestException('OTHER scope certificates must be issued to OTHER recipients.');
    }
  }

  private normalizeFolderName(rawValue: string): string {
    const value = rawValue.trim();
    if (!value) {
      throw new BadRequestException('Folder name cannot be empty.');
    }

    return value;
  }

  private normalizeFolderEmoji(rawValue: string): string {
    const value = rawValue.trim();
    if (!value) {
      throw new BadRequestException('Folder emoji cannot be empty.');
    }

    return value;
  }

  private async ensureNoDuplicateName(
    scope: CertificateScope,
    targetId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const duplicate = await this.prisma.certificateConfig.findFirst({
      where: {
        deletedAt: null,
        name: {
          equals: name,
          mode: 'insensitive',
        },
        ...buildConfigTargetWhere(scope, targetId),
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: {
        id: true,
      },
    });

    if (duplicate) {
      throw new ConflictException(`A certificate config named "${name}" already exists for this target.`);
    }
  }

  private resolveCertificateTypeLabel(
    issuedTo: CertificateIssuedTo,
    certificateFields: Prisma.InputJsonValue | Prisma.JsonValue | null,
    rawCustomLabel?: string | null,
  ): string | null {
    if (issuedTo === CertificateIssuedTo.ATTENDEE) {
      return 'Participação';
    }

    if (issuedTo === CertificateIssuedTo.LECTURER) {
      const lecturerEventCategory = this.parseLecturerEventCategory(certificateFields);
      if (lecturerEventCategory === 'PALESTRA') {
        return 'Palestrante';
      }

      if (lecturerEventCategory === 'MINICURSO') {
        return 'Ministrante';
      }

      return this.validation.normalizeOptionalText(rawCustomLabel) ?? 'Palestrante/ministrante';
    }

    return this.validation.normalizeOptionalText(rawCustomLabel) ?? 'Manual';
  }

  private parseLecturerEventCategory(
    certificateFields: Prisma.InputJsonValue | Prisma.JsonValue | null,
  ): LecturerEventCategory | null {
    if (!certificateFields || typeof certificateFields !== 'object' || Array.isArray(certificateFields)) {
      return null;
    }

    const value = (certificateFields as Record<string, unknown>)[LECTURER_EVENT_CATEGORY_FIELD];
    return value === 'PALESTRA' || value === 'MINICURSO' || value === 'OTHER' ? value : null;
  }
}
