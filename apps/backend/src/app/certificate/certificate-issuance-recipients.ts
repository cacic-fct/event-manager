import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CertificateConfigRecord } from './certificate.constants';
import { CertificateEligibilityService, EligibleCertificateRecipient } from './certificate-eligibility.service';

export class CertificateIssuanceRecipients {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: CertificateEligibilityService,
  ) {}

  async resolvePersonRecipient(
    configId: string,
    personId: string,
  ): Promise<{ config: CertificateConfigRecord; recipient: EligibleCertificateRecipient }> {
    await this.assertPersonExists(personId);
    const config = await this.eligibility.getConfigById(configId);
    const recipient = await this.resolveForConfig(config, configId, personId, { personExists: true });
    return { config, recipient };
  }

  async resolveForConfig(
    config: CertificateConfigRecord,
    configId: string,
    personId: string,
    options: { personExists?: boolean } = {},
  ): Promise<EligibleCertificateRecipient> {
    if (!options.personExists) {
      await this.assertPersonExists(personId);
    }

    const recipients = await this.eligibility.resolveEligibleRecipients(config, personId);
    const recipient = recipients.find((item) => item.person.id === personId);
    if (!recipient) {
      throw new BadRequestException(`Person ${personId} is not eligible for config ${configId}.`);
    }

    return recipient;
  }

  private async assertPersonExists(personId: string): Promise<void> {
    const person = await this.prisma.people.findFirst({
      where: { id: personId, deletedAt: null },
      select: { id: true },
    });
    if (!person) {
      throw new BadRequestException(`Person ${personId} was not found.`);
    }
  }
}
