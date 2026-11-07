import { ANONYMOUS_AUDIENCE, audienceContext, type EventAudiencePrincipal } from '../audiences/audience-context';
import type { PrismaService } from '../prisma/prisma.service';

type PendingLoad = { resolve: (value: boolean) => void; reject: (reason: unknown) => void };

class SportsCategoryMembershipLoader {
  private readonly cache = new Map<string, Promise<boolean>>();
  private readonly pending = new Map<string, PendingLoad>();
  private scheduled = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly principal: EventAudiencePrincipal,
  ) {}

  load(groupId: string): Promise<boolean> {
    const cached = this.cache.get(groupId);
    if (cached) {
      return cached;
    }
    const promise = new Promise<boolean>((resolve, reject) => this.pending.set(groupId, { resolve, reject }));
    this.cache.set(groupId, promise);
    if (!this.scheduled) {
      this.scheduled = true;
      void Promise.resolve().then(() => this.flush());
    }
    return promise;
  }

  private async flush(): Promise<void> {
    const pending = new Map(this.pending);
    this.pending.clear();
    this.scheduled = false;
    try {
      const categories = await audienceContext.run(this.principal, () =>
        this.prisma.sportsCategory.findMany({
          where: { eventGroupId: { in: [...pending.keys()] }, deletedAt: null },
          select: { eventGroupId: true },
        }),
      );
      const memberships = new Set(categories.map((category) => category.eventGroupId));
      for (const [groupId, load] of pending) {
        load.resolve(memberships.has(groupId));
      }
    } catch (error: unknown) {
      for (const [groupId, load] of pending) {
        this.cache.delete(groupId);
        load.reject(error);
      }
    }
  }
}

/** Query-only facts scoped to both the request and its current audience policy. */
export class RequestSportsCategoryMembership {
  private readonly requests = new WeakMap<object, Map<string, SportsCategoryMembershipLoader>>();

  load(prisma: PrismaService, context: object, groupId: string): Promise<boolean> {
    const current = audienceContext.getStore() ?? ANONYMOUS_AUDIENCE;
    const principal: EventAudiencePrincipal = {
      userId: current.userId,
      personIds: [...current.personIds],
      isUnesp: current.isUnesp,
      verifiedCourseCode: current.verifiedCourseCode,
      bypass: current.bypass,
      pastParticipationBefore: current.pastParticipationBefore ? new Date(current.pastParticipationBefore) : undefined,
    };
    const key = JSON.stringify(principal);
    let loaders = this.requests.get(context);
    if (!loaders) {
      loaders = new Map();
      this.requests.set(context, loaders);
    }
    let loader = loaders.get(key);
    if (!loader) {
      loader = new SportsCategoryMembershipLoader(prisma, principal);
      loaders.set(key, loader);
    }
    return loader.load(groupId);
  }
}
