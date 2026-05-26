import { ConflictException } from '@nestjs/common';
import { People, Prisma } from '@prisma/client';
import { isRecord, readArray, readNullableString, readRequiredString, readStringArray } from './json-payload';
import { MovedRelationsSnapshot, PersonSnapshot } from './types';

export function toPersonSnapshot(person: People): PersonSnapshot {
  return {
    name: person.name,
    email: person.email,
    secondaryEmails: person.secondaryEmails,
    identityDocument: person.identityDocument,
    academicId: person.academicId,
    userId: person.userId,
    externalRef: person.externalRef,
    mergedIntoId: person.mergedIntoId,
    deletedAt: person.deletedAt ? person.deletedAt.toISOString() : null,
  };
}

export function toPersonUpdateData(snapshot: PersonSnapshot): Prisma.PeopleUncheckedUpdateInput {
  return {
    name: snapshot.name,
    email: snapshot.email,
    secondaryEmails: snapshot.secondaryEmails,
    identityDocument: snapshot.identityDocument,
    academicId: snapshot.academicId,
    userId: snapshot.userId,
    externalRef: snapshot.externalRef,
    mergedIntoId: snapshot.mergedIntoId,
    deletedAt: snapshot.deletedAt ? new Date(snapshot.deletedAt) : null,
  };
}

export function parsePersonSnapshot(value: Prisma.JsonValue, fieldName: string): PersonSnapshot {
  if (!isRecord(value)) {
    throw new ConflictException(`Invalid ${fieldName} payload.`);
  }

  const name = readRequiredString(value, 'name');
  return {
    name,
    email: readNullableString(value, 'email'),
    secondaryEmails: value.secondaryEmails === undefined ? [] : readStringArray(value, 'secondaryEmails'),
    identityDocument: readNullableString(value, 'identityDocument'),
    academicId: readNullableString(value, 'academicId'),
    userId: readNullableString(value, 'userId'),
    externalRef: readNullableString(value, 'externalRef'),
    mergedIntoId: readNullableString(value, 'mergedIntoId'),
    deletedAt: readNullableString(value, 'deletedAt'),
  };
}

export function parseMovedRelations(value: Prisma.JsonValue): MovedRelationsSnapshot {
  if (!isRecord(value)) {
    throw new ConflictException('Invalid movedRelations payload.');
  }

  const sourceAttendances = readArray(value, 'sourceAttendances').map((entry) => {
    if (!isRecord(entry)) {
      throw new ConflictException('Invalid sourceAttendances payload entry.');
    }
    return {
      eventId: readRequiredString(entry, 'eventId'),
      attendedAt: readRequiredString(entry, 'attendedAt'),
      createdAt: readRequiredString(entry, 'createdAt'),
      createdById: readNullableString(entry, 'createdById'),
    };
  });

  const sourceLectures = readArray(value, 'sourceLectures').map((entry) => {
    if (!isRecord(entry)) {
      throw new ConflictException('Invalid sourceLectures payload entry.');
    }

    return {
      eventId: readRequiredString(entry, 'eventId'),
      createdAt: readRequiredString(entry, 'createdAt'),
      createdById: readNullableString(entry, 'createdById'),
    };
  });

  return {
    sourceAttendances,
    sourceLectures,
    insertedAttendanceEventIds: readStringArray(value, 'insertedAttendanceEventIds'),
    insertedLectureEventIds: readStringArray(value, 'insertedLectureEventIds'),
    movedEventSubscriptionIds: readStringArray(value, 'movedEventSubscriptionIds'),
    movedEventGroupSubscriptionIds:
      value.movedEventGroupSubscriptionIds === undefined
        ? []
        : readStringArray(value, 'movedEventGroupSubscriptionIds'),
    movedMajorEventSubscriptionIds: readStringArray(value, 'movedMajorEventSubscriptionIds'),
  };
}
