import {
  AdminSportsTournamentRead,
  CurrentUserSportsTournamentDetail,
  PublicSportsMatch,
  PublicSportsTournamentDetail,
  RepresentativeSportsTeamWorkspace,
} from './sports-read.models';
import { AdminSportsTournamentRead as AdminSportsTournamentReadByCategory } from './sports-read-admin.models';
import { CurrentUserSportsTournamentDetail as CurrentUserSportsTournamentDetailByCategory } from './sports-read-current-user.models';
import { PublicSportsMatch as PublicSportsMatchByCategory } from './sports-read-public-match.models';
import { PublicSportsTournamentDetail as PublicSportsTournamentDetailByCategory } from './sports-read-public-tournament.models';
import { RepresentativeSportsTeamWorkspace as RepresentativeSportsTeamWorkspaceByCategory } from './sports-read-representative.models';

describe('sports read models', () => {
  it('preserves the existing barrel exports after grouping models by functionality', () => {
    expect(AdminSportsTournamentRead).toBe(AdminSportsTournamentReadByCategory);
    expect(CurrentUserSportsTournamentDetail).toBe(CurrentUserSportsTournamentDetailByCategory);
    expect(PublicSportsMatch).toBe(PublicSportsMatchByCategory);
    expect(PublicSportsTournamentDetail).toBe(PublicSportsTournamentDetailByCategory);
    expect(RepresentativeSportsTeamWorkspace).toBe(RepresentativeSportsTeamWorkspaceByCategory);
  });
});
