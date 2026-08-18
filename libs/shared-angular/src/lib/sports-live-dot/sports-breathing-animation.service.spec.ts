import '@angular/compiler';

import { sportsBreathingBrightness } from './sports-breathing-animation.service';

describe('sportsBreathingBrightness', () => {
  it('uses Metro’s five-second Gaussian breathing curve', () => {
    expect(sportsBreathingBrightness(0)).toBe(15);
    expect(sportsBreathingBrightness(2_500)).toBe(100);
    expect(sportsBreathingBrightness(5_000)).toBe(15);
  });
});
