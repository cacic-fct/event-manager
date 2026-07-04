export const Permission = {
  Certificate: {
    Read: 'certificate#read',
    Issue: 'certificate#issue',
    Reissue: 'certificate#reissue',
    Delete: 'certificate#delete',
  },
  CertificateConfig: {
    Read: 'certificate-config#read',
    Create: 'certificate-config#create',
    Update: 'certificate-config#update',
    Delete: 'certificate-config#delete',
  },
  Event: {
    Read: 'event#read',
    Create: 'event#create',
    Update: 'event#update',
    Delete: 'event#delete',
  },
  EventAttendance: {
    Read: 'event-attendance#read',
    Collect: 'event-attendance#collect',
    Import: 'event-attendance#import',
    Update: 'event-attendance#update',
    Delete: 'event-attendance#delete',
  },
  EventAttendanceCollector: {
    Read: 'event-attendance-collector#read',
    Create: 'event-attendance-collector#create',
    Delete: 'event-attendance-collector#delete',
  },
  EventGroup: {
    Read: 'event-group#read',
    Create: 'event-group#create',
    Update: 'event-group#update',
    Delete: 'event-group#delete',
  },
  EventLecturer: {
    Read: 'event-lecturer#read',
    Create: 'event-lecturer#create',
    Update: 'event-lecturer#update',
    Delete: 'event-lecturer#delete',
  },
  EventForm: {
    Read: 'event-form#read',
    Create: 'event-form#create',
    Update: 'event-form#update',
    Delete: 'event-form#delete',
    Publish: 'event-form#publish',
    Results: 'event-form#results',
    Export: 'event-form#export',
  },
  Frozen: {
    Update: 'frozen#update',
    Delete: 'frozen#delete',
  },
  MajorEvent: {
    Read: 'major-event#read',
    Create: 'major-event#create',
    Update: 'major-event#update',
    Delete: 'major-event#delete',
  },
  MergeCandidate: {
    Read: 'merge-candidate#read',
    Create: 'merge-candidate#create',
    Update: 'merge-candidate#update',
    Scan: 'merge-candidate#scan',
    Merge: 'merge-candidate#merge',
    Undo: 'merge-candidate#undo',
    Delete: 'merge-candidate#delete',
  },
  Person: {
    Read: 'person#read',
    Create: 'person#create',
    Update: 'person#update',
    Delete: 'person#delete',
  },
  PermissionGrant: {
    Read: 'permission-grant#read',
    Create: 'permission-grant#create',
    Update: 'permission-grant#update',
    Delete: 'permission-grant#delete',
  },
  PlacePreset: {
    Read: 'place-preset#read',
    Create: 'place-preset#create',
    Update: 'place-preset#update',
    Merge: 'place-preset#merge',
    Delete: 'place-preset#delete',
  },
  Receipt: {
    Read: 'receipt#read',
    Approve: 'receipt#approve',
    Reject: 'receipt#reject',
    Undo: 'receipt#undo',
  },
  Subscription: {
    Read: 'subscription#read',
    Create: 'subscription#create',
    Update: 'subscription#update',
    Import: 'subscription#import',
    Delete: 'subscription#delete',
  },
  User: {
    Read: 'user#read',
  },
} as const;

type NestedPermissionValue<T> = T extends string
  ? T
  : T extends Record<string, unknown>
    ? NestedPermissionValue<T[keyof T]>
    : never;

export type Permission = NestedPermissionValue<typeof Permission>;

export type PermissionRequirement = readonly Permission[];

export const EventManagerKeycloakRole = {
  Access: 'access',
  SuperAdmin: 'super-admin',
} as const;

export type EventManagerKeycloakRole =
  (typeof EventManagerKeycloakRole)[keyof typeof EventManagerKeycloakRole];

export const EventManagerPermissionGrantScope = {
  Global: 'GLOBAL',
  Event: 'EVENT',
  MajorEvent: 'MAJOR_EVENT',
  EventGroup: 'EVENT_GROUP',
} as const;

export type EventManagerPermissionGrantScope =
  (typeof EventManagerPermissionGrantScope)[keyof typeof EventManagerPermissionGrantScope];
