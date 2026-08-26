import { PublicPrizeDrawChanceMode } from '@cacic-fct/event-manager-public-contracts';
import { delay, graphql, HttpResponse } from 'msw';
import { createPublicPrizeDrawStory, publicPrizeDrawStoryId } from './prize-draw-story.fixtures';

export type PublicPrizeDrawStoryState = {
  drawCount: number;
  spinCount: number;
  chanceMode: PublicPrizeDrawChanceMode;
  frozen: boolean;
  requestDelay: number;
};

export function createPublicPrizeDrawStoryHandlers(readState: () => PublicPrizeDrawStoryState) {
  return [
    graphql.query('PublicPrizeDraws', async () => {
      const state = readState();
      if (state.requestDelay > 0) await delay(state.requestDelay);
      return HttpResponse.json({
        data: {
          publicPrizeDraws: Array.from({ length: state.drawCount }, (_, index) =>
            createPublicPrizeDrawStory({
              id: publicPrizeDrawStoryId(index),
              title: index === 0 ? 'Sorteio de boas-vindas' : `Sorteio ${index + 1}`,
              chanceMode: state.chanceMode,
              frozenAt: state.frozen ? new Date(Date.now() - 20 * 60_000).toISOString() : null,
              spinCount: state.spinCount,
            }),
          ),
        },
      });
    }),
  ];
}
