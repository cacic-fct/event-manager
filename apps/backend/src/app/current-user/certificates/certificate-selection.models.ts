import type { Certificate, CertificateCatalogPage, CertificateSelectionGroup } from '@cacic-fct/shared-utils';
import { CertificateScope } from '@cacic-fct/shared-data-types';
import { Field, Int, ObjectType } from '@nestjs/graphql';

type SelectionConfig = Certificate['config'];
type SelectionTemplate = Certificate['certificateTemplate'];
type SelectionItem = CertificateCatalogPage['items'][number];

@ObjectType()
export class CurrentUserCertificateSelectionTemplate implements SelectionTemplate {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;
}

@ObjectType()
export class CurrentUserCertificateSelectionConfig implements SelectionConfig {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => CertificateScope)
  scope!: SelectionConfig['scope'];

  @Field(() => String, { nullable: true })
  certificateText?: string | null;

  @Field(() => CurrentUserCertificateSelectionTemplate)
  certificateTemplate!: SelectionTemplate;
}

@ObjectType()
export class CurrentUserSelectableCertificate implements Certificate {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  configId!: string;

  @Field(() => String, { description: 'Issuance timestamp in ISO 8601 format.' })
  issuedAt!: string;

  @Field(() => CurrentUserCertificateSelectionConfig)
  config!: SelectionConfig;

  @Field(() => CurrentUserCertificateSelectionTemplate)
  certificateTemplate!: SelectionTemplate;
}

@ObjectType()
export class CurrentUserCertificateSelectionItem implements SelectionItem {
  @Field(() => String, { description: 'Attendance row: event, event-group, major-event, or folder.' })
  targetType!: CertificateSelectionGroup['targetType'];

  @Field(() => String)
  targetId!: string;

  @Field(() => CurrentUserSelectableCertificate)
  certificate!: Certificate;
}

@ObjectType()
export class CurrentUserCertificateCatalog implements CertificateCatalogPage {
  @Field(() => [CurrentUserCertificateSelectionItem])
  items!: SelectionItem[];

  @Field(() => String, { nullable: true })
  nextCursor!: string | null;
}

@ObjectType()
export class CurrentUserCertificateArchiveStatus {
  @Field(() => Int)
  cooldownSeconds!: number;
}
