export const PUBLIC_PAYMENT_INFO_FIELDS = `
  id
  bankName
  agency
  account
  holder
  document
  pixKey
  majorEventId
`;

export const PUBLIC_MAJOR_EVENT_PRICE_FIELDS = `
  id
  type
  tiers {
    id
    name
    value
    includesSportsRegistration
  }
`;

export const PUBLIC_MAJOR_EVENT_SUMMARY_FIELDS = `
  id
  name
  subscriptionStartDate
  subscriptionEndDate
  requiresImageLicenseAgreement
`;

export const PUBLIC_MAJOR_EVENT_CARD_FIELDS = `
  id
  name
  emoji
  startDate
  endDate
  hasEvents
  description
  subscriptionStartDate
  subscriptionEndDate
  rankedSubscriptionEnabled
  requiresImageLicenseAgreement
  buttonText
  buttonLink
  isPaymentRequired
  sportsTournament {
    id
    selfSubscriptionEnabled
  }
`;

export const PUBLIC_MAJOR_EVENT_SUBSCRIPTION_FIELDS = `
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
  requiresImageLicenseAgreement
  isPaymentRequired
  additionalPaymentInfo
  paymentInfo {
    ${PUBLIC_PAYMENT_INFO_FIELDS}
  }
  majorEventPrices {
    ${PUBLIC_MAJOR_EVENT_PRICE_FIELDS}
  }
  sportsTournament {
    id
    selfSubscriptionEnabled
    registrationOpen
  }
`;

export const PUBLIC_MAJOR_EVENT_PROFILE_FIELDS = `
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
  shouldIssueCertificate
  sportsTournament {
    id
  }
  requiresImageLicenseAgreement
`;

export const PUBLIC_NAMED_ENTITY_FIELDS = `
  id
  name
`;

export const PUBLIC_EVENT_GROUP_DETAIL_FIELDS = `
  id
  name
  emoji
  requiresImageLicenseAgreement
  shouldIssueCertificateForEachEvent
  shouldIssuePartialCertificate
  shouldIssueCertificate
`;

export const PUBLIC_LECTURER_PROFILE_FIELDS = `
  id
  displayName
  biography
  publishGoogleUserPicture
  googleUserPicture
  email
  whatsapp
`;

export const PUBLIC_CALENDAR_EVENT_FIELDS = `
  id
  name
  startDate
  endDate
  emoji
  type
  shortDescription
  locationDescription
  majorEvent {
    ${PUBLIC_NAMED_ENTITY_FIELDS}
  }
  eventGroup {
    ${PUBLIC_NAMED_ENTITY_FIELDS}
  }
  sportsMatch {
    id
    categoryId
    category {
      tournamentId
    }
  }
`;

export const PUBLIC_MAP_EVENT_FIELDS = `
  id
  name
  startDate
  endDate
  emoji
  latitude
  longitude
  locationDescription
`;

export const PUBLIC_EVENT_PAGE_FIELDS = `
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
  requiresImageLicenseAgreement
  subscriptionStartDate
  subscriptionEndDate
  slots
  shouldIssueCertificate
  shouldCollectAttendance
  shouldAllowOralAttendance
  isOnlineAttendanceAllowed
  onlineAttendanceStartDate
  onlineAttendanceEndDate
  isPubliclyListed
  youtubeCode
  buttonText
  buttonLink
  majorEvent {
    ${PUBLIC_MAJOR_EVENT_SUMMARY_FIELDS}
  }
  eventGroup {
    ${PUBLIC_NAMED_ENTITY_FIELDS}
    requiresImageLicenseAgreement
  }
  sportsMatch {
    id
    categoryId
    category {
      tournamentId
    }
  }
  lecturers {
    ${PUBLIC_LECTURER_PROFILE_FIELDS}
  }
`;

export const PUBLIC_SUBSCRIPTION_EVENT_FIELDS = `
  id
  name
  startDate
  endDate
  emoji
  type
  shortDescription
  locationDescription
  eventGroupId
  autoSubscribe
  eventGroup {
    ${PUBLIC_NAMED_ENTITY_FIELDS}
    requiresImageLicenseAgreement
  }
`;

export const PUBLIC_ATTENDANCE_EVENT_FIELDS = `
  id
  name
  creditMinutes
  startDate
  endDate
  emoji
  type
  description
  shortDescription
  locationDescription
  majorEventId
  eventGroupId
  subscriptionStartDate
  subscriptionEndDate
  slots
  shouldIssueCertificate
  shouldCollectAttendance
  shouldAllowOralAttendance
  isOnlineAttendanceAllowed
  onlineAttendanceStartDate
  onlineAttendanceEndDate
  youtubeCode
  buttonText
  buttonLink
  majorEvent {
    ${PUBLIC_MAJOR_EVENT_PROFILE_FIELDS}
  }
  eventGroup {
    ${PUBLIC_EVENT_GROUP_DETAIL_FIELDS}
  }
  sportsMatch {
    id
    categoryId
    category {
      tournamentId
    }
  }
  lecturers {
    ${PUBLIC_LECTURER_PROFILE_FIELDS}
  }
`;

export const PUBLIC_EVENT_SUBSCRIPTION_SUMMARY_FIELDS = `
  eventId
  hasAvailableSlots
  availableSlots
  projectedQueuePosition
`;

export const PUBLIC_EVENT_WEATHER_FIELDS = `
  eventId
  temperature
  weatherCode
  summary
  materialIcon
  forecastTime
  fetchedAt
  attribution
`;

export const PUBLIC_CERTIFICATE_VALIDATION_FIELDS = `
  id
  issuedAt
  personName
  maskedIdentityDocument
  scope
  certificateName
  issuedTo
  certificateTypeLabel
  certificateText
  shouldAutofillSecondPage
  secondPageText
  targetName
  targetEmoji
  totalCreditMinutes
  sections {
    title
    type
    creditMinutes
    events {
      name
      id
      emoji
      startDate
      endDate
      creditMinutes
    }
  }
`;

export const CERTIFICATE_DOWNLOAD_FIELDS = `
  fileName
  mimeType
  contentBase64
`;
