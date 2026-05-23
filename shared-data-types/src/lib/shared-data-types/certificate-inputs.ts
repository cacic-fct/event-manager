import { Field, InputType } from '@nestjs/graphql';

import { CertificateIssuedTo, CertificateScope } from './enums';

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
  certificateFieldsJson?: string;
}
