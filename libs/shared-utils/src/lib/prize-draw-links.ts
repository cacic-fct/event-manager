export type PublicPrizeDrawDeepLinkInput = {
  drawId: string;
  targetId: string;
  targetType: 'EVENT' | 'EVENT_GROUP' | 'MAJOR_EVENT';
};

export function publicPrizeDrawAnchorId(drawId: string): string {
  return `draw-${drawId}`;
}

export function publicPrizeDrawPath(input: PublicPrizeDrawDeepLinkInput): string {
  const segment = {
    EVENT: 'event',
    EVENT_GROUP: 'event-group',
    MAJOR_EVENT: 'major-event',
  }[input.targetType];
  return `/app/draws/${segment}/${encodeURIComponent(input.targetId)}#${publicPrizeDrawAnchorId(input.drawId)}`;
}

export function publicPrizeDrawUrl(input: PublicPrizeDrawDeepLinkInput, origin: string): string {
  return new URL(publicPrizeDrawPath(input), origin).toString();
}
