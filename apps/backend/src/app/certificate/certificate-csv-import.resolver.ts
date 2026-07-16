import {
  Certificate,
  CertificateCsvImportInput,
  CertificateCsvImportResult,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException } from '@nestjs/common';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PersonCsvImportSupport } from '../common/person-csv-import-support';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { PrismaService } from '../prisma/prisma.service';
import { CertificateIssuingService } from './certificate-issuing.service';

type GraphqlContext = {
  req?: { user?: AuthenticatedUser };
  request?: { user?: AuthenticatedUser };
};

@Resolver(() => Certificate)
export class CertificateCsvImportResolver extends PersonCsvImportSupport {
  constructor(
    prisma: PrismaService,
    private readonly issuingService: CertificateIssuingService,
    private readonly frozenResources: FrozenResourceService = {
      assertCertificateConfigMutable: async () => undefined,
    } as unknown as FrozenResourceService,
  ) {
    super(prisma);
  }

  @Mutation(() => CertificateCsvImportResult, { name: 'issueManualCertificatesFromCsv' })
  @RequirePermissions(Permission.Certificate.Issue)
  async issueManualCertificatesFromCsv(
    @Args('input', { type: () => CertificateCsvImportInput }) input: CertificateCsvImportInput,
    @Context() context: GraphqlContext,
  ): Promise<CertificateCsvImportResult> {
    await this.frozenResources.assertCertificateConfigMutable(
      input.configId,
      context.req?.user ?? context.request?.user,
      'edit',
    );

    const { headers, rows } = this.parseCsv(input.csvContent);
    if (!headers.includes(input.selectedHeader)) {
      throw new BadRequestException(`CSV header "${input.selectedHeader}" was not found.`);
    }

    const rawValues = rows.map((row) => row[input.selectedHeader]?.trim() ?? '').filter((value) => value.length > 0);
    const uniqueRawValues = [...new Set(rawValues)];
    const inferredMatchType = this.inferMatchType(uniqueRawValues);
    const rawValueByNormalizedValue = new Map(
      uniqueRawValues.map((value) => [this.normalizeImportValue(value, inferredMatchType), value]),
    );
    const { personByValue, ambiguousPeopleByValue } = await this.findPeopleByImportValues(
      uniqueRawValues,
      inferredMatchType,
    );
    const resolutionByValue = new Map(
      (input.resolutions ?? []).map((resolution) => [
        this.normalizeImportValue(resolution.value, inferredMatchType),
        resolution.personId,
      ]),
    );
    const ambiguousValues: CertificateCsvImportResult['ambiguousValues'] = [];

    for (const [normalizedValue, candidates] of ambiguousPeopleByValue.entries()) {
      const personId = resolutionByValue.get(normalizedValue);
      if (!personId) {
        ambiguousValues.push({
          value: rawValueByNormalizedValue.get(normalizedValue) ?? normalizedValue,
          candidates: candidates.map((candidate) => ({ id: candidate.id, name: candidate.name })),
        });
        continue;
      }

      const person = candidates.find((candidate) => candidate.id === personId);
      if (!person) {
        throw new BadRequestException(
          `Pessoa selecionada inválida para ${rawValueByNormalizedValue.get(normalizedValue) ?? normalizedValue}.`,
        );
      }
      personByValue.set(normalizedValue, person);
    }

    if (ambiguousValues.length > 0) {
      return {
        createdCount: 0,
        duplicateCount: 0,
        failedCount: 0,
        failedValues: [],
        inferredMatchType,
        ambiguousValues,
      };
    }

    const matchedPersonIds = [...new Set([...personByValue.values()].map((person) => person.id))];
    const existingCertificates = await this.prisma.certificate.findMany({
      where: {
        configId: input.configId,
        personId: { in: matchedPersonIds },
        deletedAt: null,
      },
      select: { personId: true },
    });
    const existingPersonIds = new Set(existingCertificates.map((certificate) => certificate.personId));
    const personIdsToIssue = new Set<string>();
    const failedValues: string[] = [];
    let duplicateCount = 0;

    for (const rawValue of rawValues) {
      const person = personByValue.get(this.normalizeImportValue(rawValue, inferredMatchType));
      if (!person) {
        if (!failedValues.includes(rawValue)) {
          failedValues.push(rawValue);
        }
        continue;
      }

      if (existingPersonIds.has(person.id) || personIdsToIssue.has(person.id)) {
        duplicateCount += 1;
        continue;
      }
      personIdsToIssue.add(person.id);
    }

    const issuedCertificates = await this.issuingService.issueManualForPeople(
      input.configId,
      [...personIdsToIssue],
      this.getIssuedById(context),
    );
    return {
      createdCount: issuedCertificates.length,
      duplicateCount,
      failedCount: failedValues.length,
      failedValues,
      inferredMatchType,
      ambiguousValues: [],
    };
  }

  private getIssuedById(context: GraphqlContext): string | undefined {
    const id = context.req?.user?.sub ?? context.request?.user?.sub;
    return id?.trim() || undefined;
  }
}
