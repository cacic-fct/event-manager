import { SetMetadata } from '@nestjs/common';

export const PAST_PARTICIPATION_ACCESS = 'event-audience:past-participation';

/** Personal historical reads only; this never authorizes registration or other writes. */
export const IncludePastParticipation = () => SetMetadata(PAST_PARTICIPATION_ACCESS, true);
