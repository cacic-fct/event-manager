/**
 * Framework-free sports metadata for browser and server consumers.
 *
 * Keep this entrypoint limited to values that do not register GraphQL types or
 * import NestJS. Frontend code must use this subpath instead of the package
 * root whenever it needs sports metadata at runtime.
 */
export * from './shared-data-types/sports-metadata';
export * from './shared-data-types/sports-presentation';
export * from './shared-data-types/sports-rules';

export type {
  SportsFormat,
  SportsLossReason,
  SportsMatchState,
  SportsOfficialRole,
  SportsPreset,
  SportsRosterRole,
  SportsStageType,
} from './shared-data-types/sports-enums';
