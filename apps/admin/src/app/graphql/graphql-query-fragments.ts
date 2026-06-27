export const EVENT_LIST_FIELDS = `
  id
  name
  startDate
  endDate
  emoji
  type
  majorEventId
  eventGroupId
  shouldIssueCertificate
  shouldIssueCertificateForNonPayingAttendees
  shouldIssueCertificateForNonSubscribedAttendees
  publicationState
  scheduledPublishAt
  publishedAt
  unpublishedAt
  createdAt
  majorEvent {
    id
    name
  }
`;

export const EVENT_DETAIL_FIELDS = `
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
  shouldIssueCertificateForNonPayingAttendees
  shouldIssueCertificateForNonSubscribedAttendees
  shouldCollectAttendance
  isOnlineAttendanceAllowed
  shouldProvideSubscriberListToLecturer
  onlineAttendanceCode
  onlineAttendanceStartDate
  onlineAttendanceEndDate
  publiclyVisible
  publicationState
  scheduledPublishAt
  publishedAt
  unpublishedAt
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
    shouldIssueCertificateForNonPayingAttendees
    shouldIssueCertificateForNonSubscribedAttendees
    shouldIssueCertificateForEachEvent
    shouldIssuePartialCertificate
    deletedAt
    createdAt
    createdById
    updatedAt
    updatedById
  }
`;

export const EVENT_DRAFT_FIELDS = `
  id
  sourceEventId
  name
  payloadJson
  createdById
  createdByName
  createdByEmail
  updatedById
  updatedByName
  updatedByEmail
  createdAt
  updatedAt
  expiresAt
`;

export const EVENT_CERTIFICATE_TARGET_FIELDS = `
  id
  name
  startDate
  endDate
  emoji
  type
  createdAt
`;

export const MAJOR_EVENT_LIST_FIELDS = `
  id
  name
  emoji
  startDate
  endDate
  isPaymentRequired
  publicationState
  scheduledPublishAt
  publishedAt
  unpublishedAt
  createdAt
  majorEventPrices {
    id
    type
    tiers {
      id
      name
      value
    }
  }
`;

export const MAJOR_EVENT_DETAIL_FIELDS = `
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
  maxUncategorizedPerAttendee
  rankedSubscriptionEnabled
  buttonText
  buttonLink
  contactInfo
  contactType
  isPaymentRequired
  shouldIssueCertificateForNonPayingAttendees
  shouldIssueCertificateForNonSubscribedAttendees
  additionalPaymentInfo
  publicationState
  scheduledPublishAt
  publishedAt
  unpublishedAt
  paymentInfo {
    id
    bankName
    agency
    account
    holder
    document
    pixKey
    pixCity
    majorEventId
  }
  majorEventPrices {
    id
    type
    tiers {
      id
      name
      value
    }
  }
  deletedAt
  createdAt
  createdById
  updatedAt
  updatedById
`;

export const MAJOR_EVENT_CERTIFICATE_TARGET_FIELDS = `
  id
  name
  emoji
  startDate
  endDate
  createdAt
`;

export const EVENT_GROUP_FIELDS = `
  id
  name
  emoji
  shouldIssueCertificate
  shouldIssueCertificateForNonPayingAttendees
  shouldIssueCertificateForNonSubscribedAttendees
  shouldIssueCertificateForEachEvent
  shouldIssuePartialCertificate
  deletedAt
  createdAt
  createdById
  updatedAt
  updatedById
`;

export const EVENT_GROUP_CERTIFICATE_TARGET_FIELDS = `
  id
  name
  emoji
  shouldIssueCertificate
  shouldIssueCertificateForEachEvent
  shouldIssuePartialCertificate
  createdAt
`;

export const PLACE_PRESET_FIELDS = `
  id
  name
  latitude
  longitude
  locationDescription
`;

export const PERSON_SEARCH_FIELDS = `
  id
  name
  email
  phone
  identityDocument
  academicId
  userId
`;

export const PERSON_EXPORT_FIELDS = `
  id
  name
  email
  phone
  identityDocument
  academicId
  user {
    role
  }
`;

export const PERSON_MERGE_FIELDS = `
  id
  name
  email
  identityDocument
  academicId
  userId
  externalRef
`;

export const PERSON_DETAIL_FIELDS = `
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
  lecturerProfile {
    id
    personId
    displayName
    biography
    publishGoogleUserPicture
    googleUserPicture
    email
    whatsapp
    createdAt
    createdById
    updatedAt
    updatedById
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
  shouldAutofillSecondPage
  secondPageText
  isActive
  issuedTo
  certificateFieldsJson
  createdAt
  deletedAt
  majorEvent {
    id
    name
    endDate
    createdAt
  }
  eventGroup {
    id
    name
    createdAt
  }
  event {
    id
    name
    emoji
    endDate
    createdAt
  }
  certificateTemplate {
    id
    name
    version
  }
`;

export const CERTIFICATE_FIELDS = `
  id
  personId
  configId
  issuedAt
  certificateTemplateId
  person {
    id
    name
  }
  config {
    id
    name
    scope
    majorEvent {
      id
      endDate
      createdAt
    }
    eventGroup {
      id
      createdAt
    }
    event {
      id
      endDate
      createdAt
    }
  }
  certificateTemplate {
    id
    name
    version
  }
`;

export const CERTIFICATE_DOWNLOAD_FIELDS = `
  fileName
  mimeType
  contentBase64
`;
