import { EventManagerPermissionGrantScope, Permission, type PermissionRequirement } from './permission-types';

export const EVENT_MANAGER_PERMISSION_CATALOG = [
  Permission.Certificate.Read,
  Permission.Certificate.Issue,
  Permission.Certificate.Reissue,
  Permission.Certificate.Delete,
  Permission.CertificateConfig.Read,
  Permission.CertificateConfig.Create,
  Permission.CertificateConfig.Update,
  Permission.CertificateConfig.Delete,
  Permission.Event.Read,
  Permission.Event.Create,
  Permission.Event.Update,
  Permission.Event.Delete,
  Permission.EventAttendance.Read,
  Permission.EventAttendance.Collect,
  Permission.EventAttendance.Import,
  Permission.EventAttendance.Update,
  Permission.EventAttendance.Delete,
  Permission.EventAttendanceCollector.Read,
  Permission.EventAttendanceCollector.Create,
  Permission.EventAttendanceCollector.Delete,
  Permission.EventGroup.Read,
  Permission.EventGroup.Create,
  Permission.EventGroup.Update,
  Permission.EventGroup.Delete,
  Permission.EventLecturer.Read,
  Permission.EventLecturer.Create,
  Permission.EventLecturer.Update,
  Permission.EventLecturer.Delete,
  Permission.EventForm.Read,
  Permission.EventForm.Create,
  Permission.EventForm.Update,
  Permission.EventForm.Delete,
  Permission.EventForm.Publish,
  Permission.EventForm.Results,
  Permission.EventForm.Export,
  Permission.Frozen.Update,
  Permission.Frozen.Delete,
  Permission.MajorEvent.Read,
  Permission.MajorEvent.Create,
  Permission.MajorEvent.Update,
  Permission.MajorEvent.Delete,
  Permission.MergeCandidate.Read,
  Permission.MergeCandidate.Create,
  Permission.MergeCandidate.Update,
  Permission.MergeCandidate.Scan,
  Permission.MergeCandidate.Merge,
  Permission.MergeCandidate.Undo,
  Permission.MergeCandidate.Delete,
  Permission.Person.Read,
  Permission.Person.Create,
  Permission.Person.Update,
  Permission.Person.Delete,
  Permission.PermissionGrant.Read,
  Permission.PermissionGrant.Create,
  Permission.PermissionGrant.Update,
  Permission.PermissionGrant.Delete,
  Permission.PlacePreset.Read,
  Permission.PlacePreset.Create,
  Permission.PlacePreset.Update,
  Permission.PlacePreset.Merge,
  Permission.PlacePreset.Delete,
  Permission.Receipt.Read,
  Permission.Receipt.Approve,
  Permission.Receipt.Reject,
  Permission.Receipt.Undo,
  Permission.Subscription.Read,
  Permission.Subscription.Create,
  Permission.Subscription.Update,
  Permission.Subscription.Import,
  Permission.Subscription.Delete,
  Permission.SportsTournament.Read,
  Permission.SportsTournament.Create,
  Permission.SportsTournament.Update,
  Permission.SportsTournament.Delete,
  Permission.SportsTournament.Duplicate,
  Permission.SportsCategory.Read,
  Permission.SportsCategory.Create,
  Permission.SportsCategory.Update,
  Permission.SportsCategory.Delete,
  Permission.SportsCategory.Duplicate,
  Permission.SportsTeam.Read,
  Permission.SportsTeam.Create,
  Permission.SportsTeam.Update,
  Permission.SportsTeam.Delete,
  Permission.SportsTeam.Review,
  Permission.SportsTeam.AssignRepresentative,
  Permission.SportsTeam.Duplicate,
  Permission.SportsRegistration.Read,
  Permission.SportsRegistration.Create,
  Permission.SportsRegistration.Update,
  Permission.SportsRegistration.Delete,
  Permission.SportsRegistration.Approve,
  Permission.SportsRegistration.Reject,
  Permission.SportsMatch.Read,
  Permission.SportsMatch.Create,
  Permission.SportsMatch.Update,
  Permission.SportsMatch.Delete,
  Permission.SportsMatch.Operate,
  Permission.SportsMatch.Review,
  Permission.SportsOfficial.Read,
  Permission.SportsOfficial.Create,
  Permission.SportsOfficial.Update,
  Permission.SportsOfficial.Delete,
  Permission.SportsScore.Read,
  Permission.SportsScore.Update,
  Permission.SportsScore.Review,
  Permission.User.Read,
] as const satisfies PermissionRequirement;

export const EVENT_MANAGER_PERMISSION_SET = new Set<Permission>(EVENT_MANAGER_PERMISSION_CATALOG);

export const EVENT_MANAGER_GLOBAL_ONLY_GRANT_PERMISSIONS = [
  Permission.MergeCandidate.Read,
  Permission.MergeCandidate.Create,
  Permission.MergeCandidate.Update,
  Permission.MergeCandidate.Scan,
  Permission.MergeCandidate.Merge,
  Permission.MergeCandidate.Undo,
  Permission.MergeCandidate.Delete,
  Permission.Person.Read,
  Permission.Person.Create,
  Permission.Person.Update,
  Permission.Person.Delete,
  Permission.PermissionGrant.Read,
  Permission.PermissionGrant.Create,
  Permission.PermissionGrant.Update,
  Permission.PermissionGrant.Delete,
  Permission.PlacePreset.Read,
  Permission.PlacePreset.Create,
  Permission.PlacePreset.Update,
  Permission.PlacePreset.Merge,
  Permission.PlacePreset.Delete,
  Permission.User.Read,
] as const satisfies PermissionRequirement;

export const EVENT_MANAGER_GLOBAL_ONLY_GRANT_PERMISSION_SET = new Set<Permission>(
  EVENT_MANAGER_GLOBAL_ONLY_GRANT_PERMISSIONS,
);

export function requiresGlobalPermissionGrantScope(permission: Permission): boolean {
  return EVENT_MANAGER_GLOBAL_ONLY_GRANT_PERMISSION_SET.has(permission);
}

const GLOBAL_AND_MAJOR_EVENT_SCOPES = [
  EventManagerPermissionGrantScope.Global,
  EventManagerPermissionGrantScope.MajorEvent,
] as const;

const SPORTS_CATEGORY_SCOPES = [
  EventManagerPermissionGrantScope.Global,
  EventManagerPermissionGrantScope.MajorEvent,
  EventManagerPermissionGrantScope.EventGroup,
] as const;

const SPORTS_MATCH_SCOPES = [
  EventManagerPermissionGrantScope.Global,
  EventManagerPermissionGrantScope.MajorEvent,
  EventManagerPermissionGrantScope.EventGroup,
  EventManagerPermissionGrantScope.Event,
] as const;

const ALL_GRANT_SCOPES = Object.values(EventManagerPermissionGrantScope);

export const EVENT_MANAGER_PERMISSION_SCOPE_COMPATIBILITY: Readonly<
  Partial<Record<Permission, readonly EventManagerPermissionGrantScope[]>>
> = {
  [Permission.SportsTournament.Read]: SPORTS_MATCH_SCOPES,
  [Permission.SportsTournament.Create]: GLOBAL_AND_MAJOR_EVENT_SCOPES,
  [Permission.SportsTournament.Update]: GLOBAL_AND_MAJOR_EVENT_SCOPES,
  [Permission.SportsTournament.Delete]: GLOBAL_AND_MAJOR_EVENT_SCOPES,
  [Permission.SportsTournament.Duplicate]: GLOBAL_AND_MAJOR_EVENT_SCOPES,
  [Permission.SportsCategory.Read]: SPORTS_MATCH_SCOPES,
  [Permission.SportsCategory.Create]: GLOBAL_AND_MAJOR_EVENT_SCOPES,
  [Permission.SportsCategory.Update]: SPORTS_CATEGORY_SCOPES,
  [Permission.SportsCategory.Delete]: SPORTS_CATEGORY_SCOPES,
  [Permission.SportsCategory.Duplicate]: GLOBAL_AND_MAJOR_EVENT_SCOPES,
  [Permission.SportsTeam.Read]: SPORTS_MATCH_SCOPES,
  [Permission.SportsTeam.Create]: GLOBAL_AND_MAJOR_EVENT_SCOPES,
  [Permission.SportsTeam.Update]: GLOBAL_AND_MAJOR_EVENT_SCOPES,
  [Permission.SportsTeam.Delete]: GLOBAL_AND_MAJOR_EVENT_SCOPES,
  [Permission.SportsTeam.Review]: GLOBAL_AND_MAJOR_EVENT_SCOPES,
  [Permission.SportsTeam.AssignRepresentative]: GLOBAL_AND_MAJOR_EVENT_SCOPES,
  [Permission.SportsTeam.Duplicate]: GLOBAL_AND_MAJOR_EVENT_SCOPES,
  [Permission.SportsRegistration.Read]: SPORTS_MATCH_SCOPES,
  [Permission.SportsRegistration.Create]: SPORTS_CATEGORY_SCOPES,
  [Permission.SportsRegistration.Update]: SPORTS_CATEGORY_SCOPES,
  [Permission.SportsRegistration.Delete]: SPORTS_CATEGORY_SCOPES,
  [Permission.SportsRegistration.Approve]: SPORTS_CATEGORY_SCOPES,
  [Permission.SportsRegistration.Reject]: SPORTS_CATEGORY_SCOPES,
  [Permission.SportsMatch.Read]: SPORTS_MATCH_SCOPES,
  [Permission.SportsMatch.Create]: SPORTS_CATEGORY_SCOPES,
  [Permission.SportsMatch.Update]: SPORTS_MATCH_SCOPES,
  [Permission.SportsMatch.Delete]: SPORTS_MATCH_SCOPES,
  [Permission.SportsMatch.Operate]: SPORTS_MATCH_SCOPES,
  [Permission.SportsMatch.Review]: SPORTS_MATCH_SCOPES,
  [Permission.SportsOfficial.Read]: SPORTS_MATCH_SCOPES,
  [Permission.SportsOfficial.Create]: SPORTS_MATCH_SCOPES,
  [Permission.SportsOfficial.Update]: SPORTS_MATCH_SCOPES,
  [Permission.SportsOfficial.Delete]: SPORTS_MATCH_SCOPES,
  [Permission.SportsScore.Read]: SPORTS_MATCH_SCOPES,
  [Permission.SportsScore.Update]: SPORTS_MATCH_SCOPES,
  [Permission.SportsScore.Review]: SPORTS_MATCH_SCOPES,
};

export function getCompatiblePermissionGrantScopes(
  permission: Permission,
): readonly EventManagerPermissionGrantScope[] {
  if (requiresGlobalPermissionGrantScope(permission)) {
    return [EventManagerPermissionGrantScope.Global];
  }

  return EVENT_MANAGER_PERMISSION_SCOPE_COMPATIBILITY[permission] ?? ALL_GRANT_SCOPES;
}

export function isPermissionGrantScopeCompatible(
  permission: Permission,
  scope: EventManagerPermissionGrantScope,
): boolean {
  return getCompatiblePermissionGrantScopes(permission).includes(scope);
}
