import { getDefaultSportsEmoji } from '@cacic-fct/shared-data-types';
import { sportsDuplicationEmoji } from './sports-duplication.utils';

describe('sportsDuplicationEmoji', () => {
  it.each(['FUTSAL', 'VOLLEYBALL', 'OTHER'])('uses the shared sports emoji contract for %s', (sport) => {
    expect(sportsDuplicationEmoji(sport)).toBe(getDefaultSportsEmoji(sport));
  });
});
