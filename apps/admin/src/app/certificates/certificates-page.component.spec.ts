import { signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { Permission } from '@cacic-fct/shared-permissions';
import { Certificate, CertificateConfig } from '@cacic-fct/event-manager-admin-contracts';
import {
  adminFixtureDateFromNow,
  createAdminCertificateConfig,
  createAdminEvent,
  createAdminEventGroup,
  createAdminMajorEvent,
} from '../testing/admin-entity-fixtures';
import { PermissionsService } from '../permissions/permissions.service';
import { CertificatesService } from './certificates.service';
import { CertificatesPageComponent } from './certificates-page.component';

describe('CertificatesPageComponent', () => {
  let workspace: ReturnType<typeof workspaceStub>;
  let granted: Set<Permission>;
  let page: CertificatesPageComponent & {
    canEditSelectedTarget: () => boolean;
    canDeleteConfig: (config: CertificateConfig) => boolean;
    canCloneConfig: (config: CertificateConfig) => boolean;
    canDeleteCertificate: (certificate: Certificate) => boolean;
  };

  beforeEach(() => {
    workspace = workspaceStub();
    granted = new Set<Permission>();

    TestBed.configureTestingModule({
      providers: [
        FormBuilder,
        { provide: CertificatesService, useValue: workspace },
        {
          provide: PermissionsService,
          useValue: {
            has: (permission: Permission) => granted.has(permission),
            hasAny: (permissions: Permission[]) => permissions.some((permission) => granted.has(permission)),
            hasAll: (permissions: Permission[]) => permissions.every((permission) => granted.has(permission)),
            canDelete: (...permissions: Permission[]) => permissions.every((permission) => granted.has(permission)),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ targetType: 'event', targetId: 'event-1', configId: 'config-1' })) },
        },
      ],
    });

    page = TestBed.runInInjectionContext(
      () => new CertificatesPageComponent(),
    ) as unknown as typeof page;
  });

  it('loads route target and config selection through the workspace boundary', () => {
    expect(workspace.selectTargetByRoute).toHaveBeenCalledWith('event', 'event-1', 'config-1');
  });

  it('allows edit operations only with relevant permission and unfrozen target', () => {
    workspace.selectedTarget.set(workspace.event);
    workspace.targetFiltersForm.controls.scope.setValue('EVENT');
    granted.add(Permission.Certificate.Issue);
    expect(page.canEditSelectedTarget()).toBe(true);

    granted.clear();
    granted.add(Permission.CertificateConfig.Create);
    expect(page.canEditSelectedTarget()).toBe(true);

    workspace.event = createAdminEvent({
      id: 'event-1',
      createdAt: frozenDate(),
      endDate: frozenDate(),
    });
    workspace.issuableEvents.set([workspace.event]);
    expect(page.canEditSelectedTarget()).toBe(false);

    granted.add(Permission.Frozen.Update);
    expect(page.canEditSelectedTarget()).toBe(true);
  });

  it('applies delete and clone permission plus frozen-resource constraints', () => {
    const config = createAdminCertificateConfig({ event: workspace.event });
    const certificate = {
      id: 'certificate-1',
      config,
      person: { id: 'person-1', name: 'Ada Lovelace' },
    } as Certificate;

    granted.add(Permission.CertificateConfig.Delete);
    granted.add(Permission.CertificateConfig.Read);
    granted.add(Permission.CertificateConfig.Create);
    granted.add(Permission.Certificate.Delete);
    expect(page.canDeleteConfig(config)).toBe(true);
    expect(page.canCloneConfig(config)).toBe(true);
    expect(page.canDeleteCertificate(certificate)).toBe(true);

    const frozenEvent = createAdminEvent({
      id: workspace.event.id,
      createdAt: frozenDate(),
      endDate: frozenDate(),
    });
    const frozenConfig = createAdminCertificateConfig({ event: frozenEvent });
    const frozenCertificate = { ...certificate, config: frozenConfig } as Certificate;
    workspace.selectedTarget.set(frozenEvent);
    workspace.issuableEvents.set([frozenEvent]);
    workspace.targetFiltersForm.controls.scope.setValue('EVENT');

    expect(page.canDeleteConfig(frozenConfig)).toBe(false);
    expect(page.canCloneConfig(frozenConfig)).toBe(false);
    expect(page.canDeleteCertificate(frozenCertificate)).toBe(false);

    granted.add(Permission.Frozen.Delete);
    expect(page.canDeleteConfig(frozenConfig)).toBe(true);
    expect(page.canDeleteCertificate(frozenCertificate)).toBe(true);
    expect(page.canCloneConfig(frozenConfig)).toBe(false);
    granted.add(Permission.Frozen.Update);
    expect(page.canCloneConfig(frozenConfig)).toBe(true);
  });

  it('evaluates group, major-event, and standalone folder target freezing', () => {
    granted.add(Permission.CertificateConfig.Create);
    workspace.targetFiltersForm.controls.scope.setValue('EVENT_GROUP');
    workspace.selectedTarget.set(workspace.eventGroup);
    workspace.issuableEventGroups.set([workspace.eventGroup]);
    expect(page.canEditSelectedTarget()).toBe(true);

    workspace.targetFiltersForm.controls.scope.setValue('MAJOR_EVENT');
    workspace.selectedTarget.set(workspace.majorEvent);
    workspace.issuableMajorEvents.set([workspace.majorEvent]);
    expect(page.canEditSelectedTarget()).toBe(true);

    workspace.targetFiltersForm.controls.scope.setValue('OTHER');
    workspace.selectedTarget.set({ id: 'folder-1', name: 'Pasta' });
    workspace.selectedCertificateConfig.set(
      createAdminCertificateConfig({ scope: 'OTHER', event: null, createdAt: frozenDate() }),
    );
    expect(page.canEditSelectedTarget()).toBe(false);
    granted.add(Permission.Frozen.Update);
    expect(page.canEditSelectedTarget()).toBe(true);
  });
});

function workspaceStub() {
  const formBuilder = new FormBuilder();
  const event = createAdminEvent({ id: 'event-1' });
  const eventGroup = createAdminEventGroup({ id: 'group-1' });
  const majorEvent = createAdminMajorEvent({ id: 'major-1' });

  return {
    event,
    eventGroup,
    majorEvent,
    selectedTarget: signal<{ id: string; name: string } | null>(event),
    selectedCertificateConfig: signal<CertificateConfig | null>(null),
    issuableEvents: signal([event]),
    issuableEventGroups: signal([eventGroup]),
    issuableMajorEvents: signal([majorEvent]),
    targetFiltersForm: formBuilder.nonNullable.group({ scope: ['EVENT'], query: [''] }),
    selectTargetByRoute: vi.fn(() => Promise.resolve()),
  };
}

function frozenDate(): string {
  return adminFixtureDateFromNow(-100);
}
