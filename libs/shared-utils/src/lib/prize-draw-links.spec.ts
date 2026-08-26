import { publicPrizeDrawAnchorId, publicPrizeDrawPath, publicPrizeDrawUrl } from './prize-draw-links';

describe('prize draw public links', () => {
  const input = {
    drawId: '019d2a25-4b40-7b2e-82a4-28f596d0b657',
    targetId: 'event/with spaces',
    targetType: 'EVENT' as const,
  };

  it('builds a stable draw anchor and encoded public path', () => {
    expect(publicPrizeDrawAnchorId(input.drawId)).toBe(`draw-${input.drawId}`);
    expect(publicPrizeDrawPath(input)).toBe(
      `/app/draws/event/event%2Fwith%20spaces#draw-${input.drawId}`,
    );
  });

  it('builds an absolute URL for QR codes', () => {
    expect(publicPrizeDrawUrl(input, 'https://eventos.cacic.com.br')).toBe(
      `https://eventos.cacic.com.br/app/draws/event/event%2Fwith%20spaces#draw-${input.drawId}`,
    );
  });
});
