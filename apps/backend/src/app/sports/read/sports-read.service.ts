import { Injectable, Optional } from '@nestjs/common';
import Redis from 'ioredis';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SportsReadAdminService } from './sports-read-admin.service';
import { SportsReadCurrentUserService } from './sports-read-current-user.service';
import { SportsReadPublicService } from './sports-read-public.service';

@Injectable()
export class SportsReadService {
  readonly adminTournamentList: SportsReadAdminService['adminTournamentList'];
  readonly adminTournament: SportsReadAdminService['adminTournament'];
  readonly adminCategory: SportsReadAdminService['adminCategory'];
  readonly adminTeam: SportsReadAdminService['adminTeam'];
  readonly adminRegistration: SportsReadAdminService['adminRegistration'];
  readonly adminMatchReview: SportsReadAdminService['adminMatchReview'];
  readonly adminMatchActionReviewQueue: SportsReadAdminService['adminMatchActionReviewQueue'];
  readonly publicTournament: SportsReadPublicService['publicTournament'];
  readonly publicMatch: SportsReadPublicService['publicMatch'];
  readonly operationalMatch: SportsReadPublicService['operationalMatch'];
  readonly currentUserTournament: SportsReadCurrentUserService['currentUserTournament'];
  readonly representativeTeamWorkspace: SportsReadCurrentUserService['representativeTeamWorkspace'];
  readonly currentUserMatchOperations: SportsReadCurrentUserService['currentUserMatchOperations'];
  readonly currentUserLineup: SportsReadCurrentUserService['currentUserLineup'];

  constructor(prisma: PrismaService, authorizationPolicy: AuthorizationPolicyService, @Optional() redis?: Redis) {
    const adminReader = new SportsReadAdminService(prisma, authorizationPolicy);
    const publicReader = new SportsReadPublicService(prisma, redis);
    const currentUserReader = new SportsReadCurrentUserService(prisma, authorizationPolicy, publicReader);

    this.adminTournamentList = adminReader.adminTournamentList.bind(adminReader);
    this.adminTournament = adminReader.adminTournament.bind(adminReader);
    this.adminCategory = adminReader.adminCategory.bind(adminReader);
    this.adminTeam = adminReader.adminTeam.bind(adminReader);
    this.adminRegistration = adminReader.adminRegistration.bind(adminReader);
    this.adminMatchReview = adminReader.adminMatchReview.bind(adminReader);
    this.adminMatchActionReviewQueue = adminReader.adminMatchActionReviewQueue.bind(adminReader);
    this.publicTournament = publicReader.publicTournament.bind(publicReader);
    this.publicMatch = publicReader.publicMatch.bind(publicReader);
    this.operationalMatch = publicReader.operationalMatch.bind(publicReader);
    this.currentUserTournament = currentUserReader.currentUserTournament.bind(currentUserReader);
    this.representativeTeamWorkspace = currentUserReader.representativeTeamWorkspace.bind(currentUserReader);
    this.currentUserMatchOperations = currentUserReader.currentUserMatchOperations.bind(currentUserReader);
    this.currentUserLineup = currentUserReader.currentUserLineup.bind(currentUserReader);
  }
}
