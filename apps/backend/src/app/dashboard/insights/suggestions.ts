import { DashboardActionLink } from '../models';

export function buildSuggestions(input: {
  upcomingActivitiesCount: number;
  canManageEvents: boolean;
  canManageMajorEvents: boolean;
}): DashboardActionLink[] {
  if (input.upcomingActivitiesCount > 0) {
    return [];
  }

  const suggestions: DashboardActionLink[] = [];
  if (input.canManageEvents) {
    suggestions.push(
      {
        action: 'CREATE_EVENT_GROUP',
        label: 'Criar grupo de eventos',
      },
      {
        action: 'CREATE_EVENT',
        label: 'Criar evento',
      },
    );
  }
  if (input.canManageMajorEvents) {
    suggestions.push({
      action: 'CREATE_MAJOR_EVENT',
      label: 'Criar grande evento',
    });
  }

  return suggestions;
}
