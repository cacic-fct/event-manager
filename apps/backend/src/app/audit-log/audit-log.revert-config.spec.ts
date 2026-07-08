import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException } from '@nestjs/common';
import { AuditLogEntityType, AuditLogOperation } from '@prisma/client';
import { getAuditLogRevertConfig, isReversibleAuditOperation } from './audit-log.revert-config';

describe('getAuditLogRevertConfig', () => {
  it.each([
    [AuditLogEntityType.PERSON, Permission.Person.Read, true],
    [AuditLogEntityType.EVENT, Permission.Event.Read, true],
    [AuditLogEntityType.MAJOR_EVENT, Permission.MajorEvent.Read, true],
    [AuditLogEntityType.EVENT_GROUP, Permission.EventGroup.Read, true],
    [AuditLogEntityType.PLACE_PRESET, Permission.PlacePreset.Read, true],
    [AuditLogEntityType.PERMISSION_GRANT, Permission.PermissionGrant.Read, true],
    [AuditLogEntityType.EVENT_SUBSCRIPTION, Permission.Subscription.Read, true],
    [AuditLogEntityType.EVENT_GROUP_SUBSCRIPTION, Permission.Subscription.Read, true],
    [AuditLogEntityType.MAJOR_EVENT_SUBSCRIPTION, Permission.Subscription.Read, true],
    [AuditLogEntityType.EVENT_ATTENDANCE, Permission.EventAttendance.Read, false],
    [AuditLogEntityType.EVENT_ATTENDANCE_COLLECTOR, Permission.EventAttendanceCollector.Read, false],
    [AuditLogEntityType.EVENT_LECTURER, Permission.EventLecturer.Read, false],
    [AuditLogEntityType.EVENT_FORM, Permission.EventForm.Read, true],
    [AuditLogEntityType.EVENT_FORM_LINK, Permission.EventForm.Read, true],
    [AuditLogEntityType.EVENT_FORM_RESPONSE, Permission.EventForm.Results, false],
    [AuditLogEntityType.CERTIFICATE_CONFIG, Permission.CertificateConfig.Read, true],
    [AuditLogEntityType.CERTIFICATE, Permission.Certificate.Read, true],
    [AuditLogEntityType.MERGE_CANDIDATE, Permission.MergeCandidate.Read, true],
    [AuditLogEntityType.RECEIPT_VALIDATION, Permission.Receipt.Read, false],
  ] as const)('builds revert config for %s', (entityType, readPermission, supportsSoftDelete) => {
    expect(getAuditLogRevertConfig(entityType)).toMatchObject({
      readPermission,
      supportsSoftDelete,
    });
  });

  it('exposes mutable field and select metadata for editable entities', () => {
    expect(getAuditLogRevertConfig(AuditLogEntityType.EVENT)).toMatchObject({
      updatePermission: Permission.Event.Update,
      deletePermission: Permission.Event.Delete,
      mutableFields: expect.arrayContaining(['name', 'onlineAttendanceCode', 'deletedAt']),
      select: expect.objectContaining({
        id: true,
        name: true,
        onlineAttendanceCode: true,
        deletedAt: true,
      }),
    });

    expect(getAuditLogRevertConfig(AuditLogEntityType.PERMISSION_GRANT)).toMatchObject({
      updatePermission: Permission.PermissionGrant.Update,
      deletePermission: Permission.PermissionGrant.Delete,
      mutableFields: expect.arrayContaining(['permission', 'scope', 'validUntil', 'deletedAt']),
      select: expect.objectContaining({
        permission: true,
        scope: true,
        validUntil: true,
        deletedAt: true,
      }),
    });
  });

  it('throws for unsupported entity types', () => {
    expect(() => getAuditLogRevertConfig('UNSUPPORTED_ENTITY' as AuditLogEntityType)).toThrow(BadRequestException);
  });
});

describe('isReversibleAuditOperation', () => {
  it.each([
    AuditLogOperation.CREATE,
    AuditLogOperation.UPDATE,
    AuditLogOperation.DELETE,
    AuditLogOperation.RESTORE,
  ])('allows %s operations to be reverted', (operation) => {
    expect(isReversibleAuditOperation(operation)).toBe(true);
  });

  it.each([
    AuditLogOperation.IMPORT,
    AuditLogOperation.ISSUE,
    AuditLogOperation.MERGE,
    AuditLogOperation.REISSUE,
    AuditLogOperation.SCAN,
    AuditLogOperation.UNDO,
    AuditLogOperation.REVERT,
  ])('blocks %s operations from being reverted', (operation) => {
    expect(isReversibleAuditOperation(operation)).toBe(false);
  });
});
