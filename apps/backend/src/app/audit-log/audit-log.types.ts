import { Permission } from '@cacic-fct/shared-permissions';
import { AuditLogActorType, AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';

export type AuditActor = {
  id?: string | null;
  name: string;
  email?: string | null;
  type: AuditLogActorType;
};

export type AuditScope = {
  permission?: Permission | string | null;
  eventId?: string | null;
  majorEventId?: string | null;
  eventGroupId?: string | null;
};

export type AuditRecordOptions = {
  entityType: AuditLogEntityType;
  entityId: string;
  entityLabel?: string | null;
  operation: AuditLogOperation;
  actor?: AuthenticatedUser | AuditActor | null;
  before?: unknown;
  after?: unknown;
  summary?: string | null;
  scope?: AuditScope;
  metadata?: Record<string, unknown>;
  force?: boolean;
  squashWindowMs?: number;
};

export type AuditPrismaClient = PrismaService | Prisma.TransactionClient;

export type StoredAuditChange = {
  field: string;
  label?: string;
  before: unknown;
  after: unknown;
};

export type RevertEntityConfig = {
  readPermission: Permission;
  updatePermission?: Permission;
  deletePermission?: Permission;
  select: Record<string, unknown>;
  mutableFields: readonly string[];
  supportsSoftDelete: boolean;
};
