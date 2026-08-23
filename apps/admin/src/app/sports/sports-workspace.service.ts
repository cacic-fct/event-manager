import { Service } from '@angular/core';
import { SportsWorkspaceReviewService } from './sports-workspace-review.service';

@Service({ autoProvided: false })
export class SportsWorkspaceService extends SportsWorkspaceReviewService {}
