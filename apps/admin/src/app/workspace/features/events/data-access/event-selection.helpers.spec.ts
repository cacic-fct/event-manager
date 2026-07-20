import {
  findMatchingPlacePreset,
  getEventGroupCertificatePermissions,
  resolveMajorEventSelection,
  uniquePlacePresets,
} from './event-selection.helpers';
import { createAdminEvent, createAdminEventGroup, createAdminMajorEvent, createAdminPlacePreset } from '../../../../testing/admin-entity-fixtures';

describe('workspace event selection helpers', () => {
  it('uses event group certificate defaults while retaining unresolved state', () => {
    expect(getEventGroupCertificatePermissions({ status: 'none' })).toEqual({
      allowsCertificates: true,
      allowsNonPayingCertificates: true,
      allowsNonSubscribedCertificates: true,
    });
    expect(getEventGroupCertificatePermissions({ status: 'unresolved' })).toEqual({
      allowsCertificates: null,
      allowsNonPayingCertificates: null,
      allowsNonSubscribedCertificates: null,
    });
    expect(
      getEventGroupCertificatePermissions({
        status: 'found',
        group: createAdminEventGroup({
          shouldIssueCertificate: false,
          shouldIssueCertificateForNonPayingAttendees: true,
          shouldIssueCertificateForNonSubscribedAttendees: false,
        }),
      }),
    ).toEqual({
      allowsCertificates: false,
      allowsNonPayingCertificates: true,
      allowsNonSubscribedCertificates: false,
    });
    expect(
      getEventGroupCertificatePermissions({
        status: 'found',
        group: createAdminEventGroup({
          shouldIssueCertificate: false,
          shouldIssueCertificateForNonPayingAttendees: undefined as never,
          shouldIssueCertificateForNonSubscribedAttendees: undefined as never,
        }),
      }),
    ).toEqual({
      allowsCertificates: false,
      allowsNonPayingCertificates: false,
      allowsNonSubscribedCertificates: false,
    });
  });

  it('matches normalized place data and removes duplicate presets by id', () => {
    const first = createAdminPlacePreset({
      id: 'place-1',
      name: 'Campus',
      latitude: -22.1,
      longitude: -48.2,
      locationDescription: '  Campus   Central ',
    });
    const replacement = { ...first, name: 'Campus atualizado' };
    expect(findMatchingPlacePreset({ latitude: -22.1, longitude: -48.2, locationDescription: 'campus central' }, [first])).toBe(first);
    expect(uniquePlacePresets([first], [replacement])).toEqual([replacement]);
  });

  it('uses embedded or searched major event data and reports unknown relations', () => {
    const majorEvent = createAdminMajorEvent({ id: 'major-1', name: 'Semana' });
    const event = createAdminEvent({ majorEventId: 'major-1', majorEvent });
    expect(resolveMajorEventSelection(event, [])).toEqual({ status: 'found', majorEvent });
    expect(resolveMajorEventSelection(createAdminEvent({ majorEventId: 'missing', majorEvent: null }), [])).toEqual({
      status: 'unresolved',
    });
    expect(resolveMajorEventSelection(createAdminEvent({ majorEventId: 'major-1', majorEvent: null }), [], [majorEvent])).toEqual({
      status: 'found',
      majorEvent,
    });
  });
});
