import { buildSuggestions } from './suggestions';

describe('buildSuggestions', () => {
  it('returns no suggestions when activities are already upcoming', () => {
    expect(
      buildSuggestions({
        upcomingActivitiesCount: 1,
        canManageEvents: true,
        canManageMajorEvents: true,
      }),
    ).toEqual([]);
  });

  it('returns event and major event creation links based on permissions', () => {
    expect(
      buildSuggestions({
        upcomingActivitiesCount: 0,
        canManageEvents: true,
        canManageMajorEvents: true,
      }),
    ).toEqual([
      { action: 'CREATE_EVENT_GROUP', label: 'Criar grupo de eventos' },
      { action: 'CREATE_EVENT', label: 'Criar evento' },
      { action: 'CREATE_MAJOR_EVENT', label: 'Criar grande evento' },
    ]);
  });

  it('returns no suggestions without management permissions', () => {
    expect(
      buildSuggestions({
        upcomingActivitiesCount: 0,
        canManageEvents: false,
        canManageMajorEvents: false,
      }),
    ).toEqual([]);
  });
});
