import { Field, InputType } from '@nestjs/graphql';

import { CertificateIssuedTo, CertificateScope } from './enums';

@InputType()
export class CertificateCsvImportResolutionInput {
  @Field(() => String)
  value!: string;

  @Field(() => String)
  personId!: string;
}

@InputType()
export class CertificateCsvImportInput {
  @Field(() => String)
  configId!: string;

  @Field(() => String)
  csvContent!: string;

  @Field(() => String)
  selectedHeader!: string;

  @Field(() => [CertificateCsvImportResolutionInput], { nullable: true })
  resolutions?: CertificateCsvImportResolutionInput[];
}

@InputType()
export class CertificateConfigCreateInput {
  @Field(() => String)
  name!: string;

  @Field(() => CertificateScope)
  scope!: CertificateScope;

  @Field(() => String, { nullable: true })
  majorEventId?: string;

  @Field(() => String, { nullable: true })
  eventGroupId?: string;

  @Field(() => String, { nullable: true })
  eventId?: string;

  @Field(() => String, { nullable: true })
  folderId?: string;

  @Field(() => String)
  certificateTemplateId!: string;

  @Field(() => String, { nullable: true })
  certificateText?: string;

  @Field(() => Boolean, { nullable: true })
  shouldAutofillSecondPage?: boolean;

  @Field(() => String, { nullable: true })
  secondPageText?: string;

  @Field(() => Boolean, { nullable: true })
  isActive?: boolean;

  @Field(() => CertificateIssuedTo, { nullable: true })
  issuedTo?: CertificateIssuedTo;

  @Field(() => String, { nullable: true })
  certificateTypeLabel?: string;

  @Field(() => String, { nullable: true })
  certificateFieldsJson?: string;
}

@InputType()
export class CertificateConfigUpdateInput {
  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => CertificateScope, { nullable: true })
  scope?: CertificateScope;

  @Field(() => String, { nullable: true })
  majorEventId?: string;

  @Field(() => String, { nullable: true })
  eventGroupId?: string;

  @Field(() => String, { nullable: true })
  eventId?: string;

  @Field(() => String, { nullable: true })
  folderId?: string;

  @Field(() => String, { nullable: true })
  certificateTemplateId?: string;

  @Field(() => String, { nullable: true })
  certificateText?: string;

  @Field(() => Boolean, { nullable: true })
  shouldAutofillSecondPage?: boolean;

  @Field(() => String, { nullable: true })
  secondPageText?: string;

  @Field(() => Boolean, { nullable: true })
  isActive?: boolean;

  @Field(() => CertificateIssuedTo, { nullable: true })
  issuedTo?: CertificateIssuedTo;

  @Field(() => String, { nullable: true })
  certificateTypeLabel?: string;

  @Field(() => String, { nullable: true })
  certificateFieldsJson?: string;
}

@InputType()
export class CertificateConfigClonePartsInput {
  @Field(() => Boolean, { nullable: true })
  textContent?: boolean;

  @Field(() => Boolean, { nullable: true })
  recipientData?: boolean;

  @Field(() => Boolean, { nullable: true })
  activeState?: boolean;

  @Field(() => Boolean, { nullable: true })
  issuedPeople?: boolean;

  @Field(() => Boolean, { nullable: true })
  manualPeople?: boolean;
}

@InputType()
export class CertificateConfigCloneInput {
  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => CertificateScope, { nullable: true })
  scope?: CertificateScope;

  @Field(() => String, { nullable: true })
  majorEventId?: string;

  @Field(() => String, { nullable: true })
  eventGroupId?: string;

  @Field(() => String, { nullable: true })
  eventId?: string;

  @Field(() => String, { nullable: true })
  folderId?: string;

  @Field(() => CertificateConfigClonePartsInput, { nullable: true })
  parts?: CertificateConfigClonePartsInput;
}

@InputType()
export class CertificateFolderCreateInput {
  @Field(() => String)
  name!: string;

  @Field(() => String)
  emoji!: string;
}

@InputType()
export class CertificateFolderUpdateInput {
  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  emoji?: string;

  @Field(() => Boolean, { nullable: true })
  reissueCertificates?: boolean;
}
