import { FormatRegistry, Type, type TLiteral, type TProperties, type TSchema, type TUnion } from '@sinclair/typebox';
import { isValid, parseISO } from 'date-fns';

// Value.Check interprets these locally; no schema is downloaded and no code is compiled.
FormatRegistry.Set(
  'date-time',
  (value) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && isValid(parseISO(value)),
);
FormatRegistry.Set('email', (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));

export const TRANSFER_FORMAT = 'cacic-event-data';
export const TRANSFER_VERSION = 1;
export const TRANSFER_SCHEMA_ID = 'urn:cacic:event-data:v1';
export const TRANSFER_MAX_BYTES = 5 * 1024 * 1024;
export const TRANSFER_MAX_RESOURCES = 500;
export const TRANSFER_MAX_DEPTH = 32;

export const Id = Type.String({ minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$' });
export const Text = Type.String({ maxLength: 50000 });
export const Name = Type.String({ minLength: 1, maxLength: 300 });
export const DateTime = Type.String({ format: 'date-time', maxLength: 40 });
export const Revision = Type.Union([DateTime, Type.String({ pattern: '^sha256:[a-f0-9]{64}$', maxLength: 71 })]);
export const Count = Type.Integer({ minimum: 0, maximum: 2147483647 });
export const StringList = Type.Array(Type.String({ maxLength: 300 }), { maxItems: 500, uniqueItems: true });
export const IdList = Type.Array(Id, { maxItems: TRANSFER_MAX_RESOURCES, uniqueItems: true });
export const JsonObject = Type.Record(Type.String({ maxLength: 300 }), Type.Unknown(), { maxProperties: 200 });

export function nullable<T extends TSchema>(schema: T) {
  return Type.Union([schema, Type.Null()]);
}

export function enumeration<const T extends string[]>(...values: T) {
  // The builder cannot infer a mapped array's literal union without this return type.
  return Type.Union(values.map((value) => Type.Literal(value))) as TUnion<TLiteral<T[number]>[]>;
}

export function resource<const K extends string, const P extends TProperties>(kind: K, properties: P) {
  return Type.Object(
    {
      kind: Type.Literal(kind),
      id: Type.Optional(Id),
      key: Type.Optional(Id),
      revision: Type.Optional(Revision),
      data: Type.Partial(Type.Object(properties), { additionalProperties: false }),
    },
    { additionalProperties: false, anyOf: [{ required: ['id'] }, { required: ['key'] }] },
  );
}

export const Audience = enumeration('PUBLIC', 'UNESP_ONLY', 'COURSE_ONLY', 'INVITATION_ONLY');
export const AttendanceEligibility = enumeration(
  'REGISTERED_ONLY',
  'APPROVED_REGISTRATIONS_ONLY',
  'ANYONE',
  'INVITED_ONLY',
);

export const audienceFields = {
  audience: Audience,
  audienceCourseCodes: StringList,
};

export const registrationFields = {
  subscriptionStartDate: nullable(DateTime),
  subscriptionEndDate: nullable(DateTime),
  requiresImageLicenseAgreement: Type.Boolean(),
  interestEnabled: Type.Boolean(),
};

export const certificateFlags = {
  shouldIssueCertificateForNonPayingAttendees: Type.Boolean(),
  shouldIssueCertificateForNonSubscribedAttendees: Type.Boolean(),
};
