export const EVENT_FIELDS = `
  id
  name
  creditMinutes
  startDate
  endDate
  emoji
  type
  description
  shortDescription
  latitude
  longitude
  locationDescription
  majorEventId
  eventGroupId
  allowSubscription
  subscriptionStartDate
  subscriptionEndDate
  slots
  autoSubscribe
  shouldIssueCertificate
  shouldCollectAttendance
  isOnlineAttendanceAllowed
  onlineAttendanceCode
  onlineAttendanceStartDate
  onlineAttendanceEndDate
  publiclyVisible
  youtubeCode
  buttonText
  buttonLink
  deletedAt
  createdAt
  createdById
  updatedAt
  updatedById
  majorEvent {
    id
    name
    startDate
    endDate
  }
  eventGroup {
    id
    name
    emoji
    shouldIssueCertificate
    shouldIssueCertificateForEachEvent
    shouldIssuePartialCertificate
    deletedAt
    createdAt
    createdById
    updatedAt
    updatedById
  }
`;

export const MAJOR_EVENT_FIELDS = `
  id
  name
  emoji
  startDate
  endDate
  description
  subscriptionStartDate
  subscriptionEndDate
  maxCoursesPerAttendee
  maxLecturesPerAttendee
  buttonText
  buttonLink
  contactInfo
  contactType
  isPaymentRequired
  additionalPaymentInfo
  paymentInfo {
    id
    bankName
    agency
    account
    holder
    document
    majorEventId
  }
  deletedAt
  createdAt
  createdById
  updatedAt
  updatedById
`;

export const EVENT_GROUP_FIELDS = `
  id
  name
  emoji
  shouldIssueCertificate
  shouldIssueCertificateForEachEvent
  shouldIssuePartialCertificate
  deletedAt
  createdAt
  createdById
  updatedAt
  updatedById
`;

export const PERSON_FIELDS = `
  id
  name
  email
  secondaryEmails
  phone
  identityDocument
  academicId
  userId
  mergedIntoId
  externalRef
  deletedAt
  createdAt
  createdById
  updatedAt
  updatedById
  user {
    id
    name
    email
    role
  }
`;

export const CERTIFICATE_TEMPLATE_FIELDS = `
  id
  name
  description
  version
  isActive
  certificateFieldsJson
  createdAt
  createdById
  updatedAt
  updatedById
  deletedAt
`;

export const CERTIFICATE_CONFIG_FIELDS = `
  id
  name
  scope
  majorEventId
  eventGroupId
  eventId
  certificateTemplateId
  certificateText
  isActive
  issuedTo
  certificateFieldsJson
  createdAt
  createdById
  updatedAt
  updatedById
  deletedAt
  majorEvent {
    id
    name
    startDate
    endDate
  }
  eventGroup {
    ${EVENT_GROUP_FIELDS}
  }
  event {
    id
    name
    emoji
    creditMinutes
    startDate
    endDate
  }
  certificateTemplate {
    ${CERTIFICATE_TEMPLATE_FIELDS}
  }
`;

export const CERTIFICATE_FIELDS = `
  id
  personId
  configId
  renderedDataJson
  issuedAt
  issuedById
  certificateTemplateId
  createdAt
  updatedAt
  deletedAt
  person {
    ${PERSON_FIELDS}
  }
  config {
    ${CERTIFICATE_CONFIG_FIELDS}
  }
  certificateTemplate {
    ${CERTIFICATE_TEMPLATE_FIELDS}
  }
`;

export const CERTIFICATE_DOWNLOAD_FIELDS = `
  fileName
  mimeType
  contentBase64
`;
