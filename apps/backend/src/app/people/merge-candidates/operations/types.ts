export type MergeMatchMethod = 'CPF' | 'EMAIL' | 'NORMALIZED_NAME';

export type CandidateMatch = {
  personAId: string;
  personBId: string;
  pairKey: string;
  method: MergeMatchMethod;
  matchValue: string;
  score: number;
};

export type MatchablePerson = {
  id: string;
  identityDocument: string | null;
  email: string | null;
  name: string;
};

export type PersonSnapshot = {
  name: string;
  email: string | null;
  secondaryEmails: string[];
  identityDocument: string | null;
  academicId: string | null;
  userId: string | null;
  externalRef: string | null;
  mergedIntoId: string | null;
  deletedAt: string | null;
};

export type AttendanceSnapshot = {
  eventId: string;
  attendedAt: string;
  createdAt: string;
  createdById: string | null;
};

export type LectureSnapshot = {
  eventId: string;
  createdAt: string;
  createdById: string | null;
};

export type MovedRelationsSnapshot = {
  sourceAttendances: AttendanceSnapshot[];
  sourceLectures: LectureSnapshot[];
  insertedAttendanceEventIds: string[];
  insertedLectureEventIds: string[];
  movedEventSubscriptionIds: string[];
  movedEventGroupSubscriptionIds: string[];
  movedMajorEventSubscriptionIds: string[];
};
