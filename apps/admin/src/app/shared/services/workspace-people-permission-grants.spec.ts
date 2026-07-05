import { EventManagerPermissionGrant } from '@cacic-fct/event-manager-admin-contracts';
import { EventManagerPermissionGrantScope, Permission } from '@cacic-fct/shared-permissions';
import {
  buildPermissionGrantDraft,
  buildPermissionGrantInput,
  buildPermissionGrantInputFromDraft,
  buildPermissionGrantTargetInput,
  buildPermissionGrantUpdateInput,
  findPermissionGrantBatchConflict,
  formatDateTimeInput,
  getPermissionGrantDraftTargetLabel,
  getPermissionGrantInputTargetKey,
  getPermissionGrantInputTargetLabel,
  getPermissionGrantSelectionLabel,
  getPermissionGrantStatusLabel,
  getPermissionGrantTargetDateLabel,
  getPermissionGrantTargetLabel,
  getPermissionGrantValidityWindowLabel,
  getPresetAllowedScopes,
  getPresetPreferredScope,
  getPresetScope,
  isPresetScopeAllowed,
  normalizePermissionGrantValidity,
  normalizeSearchText,
  sortPermissionGrants,
} from './workspace-people-permission-grants';

describe('workspace people permission grant helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('forces global scope for permissions that cannot be scoped to a target', () => {
    expect(
      buildPermissionGrantTargetInput(
        Permission.Person.Delete,
        EventManagerPermissionGrantScope.Event,
        'event-1',
      ),
    ).toEqual({
      scope: EventManagerPermissionGrantScope.Global,
      eventId: null,
      majorEventId: null,
      eventGroupId: null,
    });
  });

  it('builds stable target keys and labels for scoped grants', () => {
    const input = buildPermissionGrantInput(
      'person-1',
      'user-1',
      Permission.EventAttendance.Collect,
      EventManagerPermissionGrantScope.Event,
      'event-1',
      { validFrom: null, validUntil: null },
    );

    expect(getPermissionGrantInputTargetKey(input)).toBe(
      'user-1|event-attendance#collect|EVENT|event-1||',
    );
    expect(
      getPermissionGrantInputTargetLabel(input, {
        events: [{ id: 'event-1', label: 'Credenciamento', startDate: null, endDate: null }],
        majorEvents: [],
        eventGroups: [],
      }),
    ).toBe('Credenciamento');
  });

  it('detects validity conflicts only for matching grant targets', () => {
    const input = buildPermissionGrantInput(
      'person-1',
      'user-1',
      Permission.Event.Read,
      EventManagerPermissionGrantScope.Event,
      'event-1',
      { validFrom: null, validUntil: '2026-07-02T12:00:00.000Z' },
    );
    const conflictingGrant = {
      id: 'grant-1',
      ...input,
      targetLabel: 'Evento',
      validUntil: '2026-07-03T12:00:00.000Z',
      createdAt: '2026-07-01T12:00:00.000Z',
      updatedAt: '2026-07-01T12:00:00.000Z',
    };

    expect(findPermissionGrantBatchConflict([input], [conflictingGrant])).toBe(conflictingGrant);
    expect(findPermissionGrantBatchConflict([{ ...input, eventId: 'event-2' }], [conflictingGrant])).toBeNull();
  });

  it('validates permission grant validity windows against the current time', () => {
    const now = new Date('2026-07-01T12:00:00.000Z');

    expect(normalizePermissionGrantValidity('', '', now)).toEqual({
      valid: true,
      value: { validFrom: null, validUntil: null },
    });
    expect(normalizePermissionGrantValidity('2026-07-02T12:00', '2026-07-01T12:00', now)).toEqual({
      valid: false,
      message: 'O fim da validade precisa ser posterior ao início.',
    });
    expect(normalizePermissionGrantValidity('', '2026-06-30T12:00', now)).toEqual({
      valid: false,
      message: 'O fim da validade precisa ser futuro.',
    });
  });

  it('normalizes target search text and preset scope defaults', () => {
    expect(normalizeSearchText('  São José  ')).toBe('sao jose');
    expect(getPresetScope('people-manager', EventManagerPermissionGrantScope.Event)).toBe(
      EventManagerPermissionGrantScope.Global,
    );
    expect(getPresetScope('form-manager', EventManagerPermissionGrantScope.Event)).toBe(
      EventManagerPermissionGrantScope.MajorEvent,
    );
    expect(getPresetScope('attendance-coordinator', EventManagerPermissionGrantScope.MajorEvent)).toBe(
      EventManagerPermissionGrantScope.MajorEvent,
    );
    expect(getPresetPreferredScope('attendance-coordinator', EventManagerPermissionGrantScope.MajorEvent)).toBe(
      EventManagerPermissionGrantScope.Event,
    );
    expect(getPresetAllowedScopes('readonly-operator')).toEqual([EventManagerPermissionGrantScope.MajorEvent]);
    expect(isPresetScopeAllowed('lecturer-manager', EventManagerPermissionGrantScope.EventGroup)).toBe(true);
    expect(isPresetScopeAllowed('receipt-reader', EventManagerPermissionGrantScope.Event)).toBe(false);
  });

  it('formats labels, validity windows, target dates, and status from grant metadata', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-07-01T12:00:00.000Z'));

    expect(getPermissionGrantSelectionLabel([])).toBe('Nenhuma permissão selecionada');
    expect(getPermissionGrantSelectionLabel([Permission.EventAttendance.Collect])).toBe(
      'Presenças · Coletar',
    );
    expect(getPermissionGrantSelectionLabel([Permission.Event.Read, Permission.Event.Update])).toBe(
      '2 permissões selecionadas',
    );
    expect(
      getPermissionGrantValidityWindowLabel({
        validFrom: '2026-07-01T12:00:00',
        validUntil: '2026-07-02T12:00:00',
      }),
    ).toBe('De 01/07/2026, 12:00 até 02/07/2026, 12:00');
    expect(getPermissionGrantStatusLabel(permissionGrant({ validFrom: '2026-07-02T12:00:00.000Z' }))).toBe(
      'Agendada',
    );
    expect(getPermissionGrantStatusLabel(permissionGrant({ validUntil: '2026-06-30T12:00:00.000Z' }))).toBe(
      'Expirada',
    );
    expect(getPermissionGrantStatusLabel(permissionGrant())).toBe('Ativa');
    expect(getPermissionGrantTargetLabel(permissionGrant())).toBe('Todos os eventos');
    expect(
      getPermissionGrantTargetDateLabel(
        {
          id: 'event-1',
          label: 'Credenciamento',
          description: null,
          emoji: null,
          startDate: '2026-07-01T12:00:00',
          endDate: null,
        },
        EventManagerPermissionGrantScope.Event,
        'en-US',
      ),
    ).toMatch(/^7\/1\/26, 12:00\sPM$/u);
  });

  it('builds drafts and update inputs without leaking helper-only fields', () => {
    const input = buildPermissionGrantInput(
      'person-1',
      'user-1',
      Permission.EventForm.Publish,
      EventManagerPermissionGrantScope.MajorEvent,
      'major-1',
      {
        validFrom: '2026-07-01T12:00:00.000Z',
        validUntil: null,
      },
    );
    const draft = buildPermissionGrantDraft(input, 'Preset: Formulários', 'SECOMPP');

    expect(draft).toEqual(
      expect.objectContaining({
        id: 'user-1|event-form#publish|MAJOR_EVENT||major-1|',
        sourceLabel: 'Preset: Formulários',
        targetLabel: 'SECOMPP',
      }),
    );
    expect(getPermissionGrantDraftTargetLabel(draft)).toBe('SECOMPP');
    expect(buildPermissionGrantInputFromDraft(draft)).toEqual(input);
    expect(
      buildPermissionGrantUpdateInput(
        Permission.EventForm.Publish,
        EventManagerPermissionGrantScope.MajorEvent,
        'major-1',
        { validFrom: null, validUntil: null },
      ),
    ).toEqual({
      permission: Permission.EventForm.Publish,
      scope: EventManagerPermissionGrantScope.MajorEvent,
      eventId: null,
      majorEventId: 'major-1',
      eventGroupId: null,
      validFrom: null,
      validUntil: null,
    });
    expect(formatDateTimeInput('2026-07-01T12:34:00')).toBe('2026-07-01T12:34');
    expect(normalizePermissionGrantValidity('invalid date', '', new Date('2026-07-01T12:00:00.000Z'))).toEqual({
      valid: false,
      message: 'Informe uma data válida para início da validade.',
    });
  });

  it('sorts grants by human-readable permission label and scope label', () => {
    expect(
      sortPermissionGrants([
        permissionGrant({
          id: 'event-update',
          permission: Permission.Event.Update,
          scope: EventManagerPermissionGrantScope.Event,
        }),
        permissionGrant({
          id: 'attendance-read',
          permission: Permission.EventAttendance.Read,
          scope: EventManagerPermissionGrantScope.Global,
        }),
        permissionGrant({
          id: 'event-read',
          permission: Permission.Event.Read,
          scope: EventManagerPermissionGrantScope.Global,
        }),
      ]).map((grant) => grant.id),
    ).toEqual(['event-update', 'event-read', 'attendance-read']);
  });
});

function permissionGrant(overrides: Partial<EventManagerPermissionGrant> = {}): EventManagerPermissionGrant {
  return {
    id: 'grant-1',
    userId: 'user-1',
    personId: 'person-1',
    permission: Permission.Event.Read,
    scope: EventManagerPermissionGrantScope.Global,
    eventId: null,
    majorEventId: null,
    eventGroupId: null,
    targetLabel: null,
    validFrom: null,
    validUntil: null,
    createdAt: '2026-07-01T12:00:00.000Z',
    createdById: 'admin-user',
    updatedAt: '2026-07-01T12:00:00.000Z',
    updatedById: 'admin-user',
    ...overrides,
  };
}
