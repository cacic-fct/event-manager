export const EVENT_LIST_FIELDS = `
  id
  isSportsMatch
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
  isSportsMatch
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
  requiresImageLicenseAgreement
  subscriptionStartDate
  subscriptionEndDate
  slots
  autoSubscribe
  shouldIssueCertificate
  shouldIssueCertificateForNonPayingAttendees
  shouldIssueCertificateForNonSubscribedAttendees
  shouldCollectAttendance
  shouldAllowOralAttendance
  isOnlineAttendanceAllowed
  shouldProvideSubscriberListToLecturer
  onlineAttendanceCode
  onlineAttendanceStartDate
  onlineAttendanceEndDate
  isPubliclyListed
  displayLecturerProfile
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
    requiresImageLicenseAgreement
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
  subscriptionStartDate
  subscriptionEndDate
  isPaymentRequired
  sportsTournament {
    id
  }
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
      includesSportsRegistration
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
  requiresImageLicenseAgreement
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
  sportsTournament {
    id
  }
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
    majorEventId
  }
  majorEventPrices {
    id
    type
    tiers {
      id
      name
      value
      includesSportsRegistration
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
  isSportsCategory
  name
  emoji
  requiresImageLicenseAgreement
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

export const MAJOR_EVENT_USER_ATTENDANCE_FIELDS = `
  majorEventId
  subscriptionId
  personId
  subscriptionStatus
  amountPaid
  paymentDate
  paymentTier
  person {
    ${PERSON_EXPORT_FIELDS}
  }
  attendances {
    eventId
    eventName
    eventEmoji
    eventStartDate
    attended
    attendedAt
    category
  }
`;

export const EVENT_ATTENDANCE_WRITE_FIELDS = `
  eventId
  personId
  attendedAt
  category
  status
  createdByMethod
`;

export const EVENT_ATTENDANCE_SCANNER_FEED_FIELDS = `
  personId
  eventId
  fullName
  identityDocument
  unespRole
  subscriptionStatus
  attendedAt
  status
  createdByMethod
  collectedByFirstName
  committedByFirstName
`;

export const OFFLINE_EVENT_ATTENDANCE_APPROVAL_FIELDS = `
  id
  eventId
  personId
  status
  resolutionIssue
  committedAt
  committedById
  committedByFullName
`;

export const OFFLINE_EVENT_ATTENDANCE_REJECTION_FIELDS = `
  id
  eventId
  status
  resolutionIssue
  rejectedAt
  rejectedById
  rejectedByFullName
  rejectionReason
`;

export const OFFLINE_EVENT_ATTENDANCE_SUBMISSION_FIELDS = `
  id
  clientId
  eventId
  personId
  status
  createdByMethod
  scannerCode
  manualValue
  collectedAt
  authorUserId
  authorName
  authorEmail
  submittedById
  submittedByFullName
  submittedAt
  stagedReason
  resolutionError
  resolutionIssue
  collectedLatitude
  collectedLongitude
  collectedAccuracyMeters
  event {
    id
    name
    emoji
    startDate
  }
  person {
    ${PERSON_EXPORT_FIELDS}
  }
`;

export const DASHBOARD_INCONSISTENCY_FIELDS = `
  type
  action
  targetId
  severity
  title
  description
  eventId
  relatedEventId
  personId
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
  isActive
  certificateFieldsJson
  createdAt
  createdById
  updatedAt
  updatedById
  deletedAt
`;

export const CERTIFICATE_FOLDER_FIELDS = `
  id
  name
  emoji
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
  folderId
  certificateTemplateId
  certificateText
  shouldAutofillSecondPage
  secondPageText
  isActive
  issuedTo
  certificateTypeLabel
  certificateFieldsJson
  createdAt
  deletedAt
  majorEvent {
    id
    name
    emoji
    startDate
    endDate
    createdAt
  }
  eventGroup {
    id
    name
    emoji
    createdAt
  }
  event {
    id
    name
    emoji
    startDate
    endDate
    createdAt
  }
  folder {
    ${CERTIFICATE_FOLDER_FIELDS}
  }
  certificateTemplate {
    id
    name
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
    createdAt
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
    folder {
      ${CERTIFICATE_FOLDER_FIELDS}
    }
  }
  certificateTemplate {
    id
    name
  }
`;

export const CERTIFICATE_DOWNLOAD_FIELDS = `
  fileName
  mimeType
  contentBase64
`;
