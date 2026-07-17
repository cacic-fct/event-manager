import {
  findMatchingPlacePreset,
  getEventGroupCertificatePermissions,
  resolveMajorEventSelection,
  uniquePlacePresets,
} from './workspace-event-selection.helpers';
import { createAdminMajorEvent, createAdminPlacePreset } from '../../testing/admin-entity-fixtures';

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
    const event = { majorEventId: 'major-1', majorEvent } as never;
    expect(resolveMajorEventSelection(event, [])).toEqual({ status: 'found', majorEvent });
    expect(resolveMajorEventSelection({ majorEventId: 'missing' } as never, [])).toEqual({ status: 'unresolved' });
  });
});
