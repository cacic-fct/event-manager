import { SetMetadata } from '@nestjs/common';
import { ALLOW_NON_ONBOARDED_KEY } from '../auth.constants';

export const AllowNonOnboarded = () => SetMetadata(ALLOW_NON_ONBOARDED_KEY, true);
