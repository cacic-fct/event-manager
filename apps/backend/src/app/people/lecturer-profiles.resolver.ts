import { isDeepStrictEqual } from 'node:util';
import {
  AdminLecturerProfileUpsertInput,
  LecturerProfile,
  LecturerProfileUpsertInput,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { ContentReviewNotifications } from '../content-review/content-review-notifications.service';
import {
  lockReviewPerson,
  mergeProfileChanges,
  profileSnapshot,
  readChanges,
  writeReview,
} from '../content-review/content-review-changes';
import { canReviewContent } from '../content-review/review-permissions';
import { AuditLogService } from '../audit-log/audit-log.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { type AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUserContextService } from '../current-user/context.service';
import { type GraphqlContext } from '../current-user/selects';
import { PrismaService } from '../prisma/prisma.service';

const LECTURER_PROFILE_SELECT = {
  id: true,
  personId: true,
  person: {
    include: {
      user: true,
    },
  },
  selfEditingBlocked: true,
  displayName: true,
  biography: true,
  publishGoogleUserPicture: true,
  googleUserPicture: true,
  email: true,
  whatsapp: true,
  linkedin: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.LecturerProfileSelect;

interface LecturerProfileData {
  displayName: string;
  biography: string | null;
  publishGoogleUserPicture: boolean;
  email: string | null;
  whatsapp: string | null;
  linkedin: string | null;
  googleUserPicture?: string | null;
  updatedById: string | undefined;
}

type LecturerProfileAuditSnapshot = Pick<
  Prisma.LecturerProfileGetPayload<{ select: typeof LECTURER_PROFILE_SELECT }>,
  | 'id'
  | 'personId'
  | 'selfEditingBlocked'
  | 'displayName'
  | 'biography'
  | 'publishGoogleUserPicture'
  | 'googleUserPicture'
  | 'email'
  | 'whatsapp'
  | 'linkedin'
  | 'createdAt'
  | 'createdById'
  | 'updatedAt'
  | 'updatedById'
>;

@Resolver(() => LecturerProfile)
export class LecturerProfilesResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly auditLog: AuditLogService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly reviewNotifications: ContentReviewNotifications,
  ) {}

  @Query(() => LecturerProfile, { name: 'lecturerProfile', nullable: true })
  @RequirePermissions(Permission.Person.Read)
  lecturerProfile(@Args('personId', { type: () => String }) personId: string) {
    return this.prisma.lecturerProfile.findUnique({
      where: {
        personId,
      },
      select: LECTURER_PROFILE_SELECT,
    });
  }

  @Mutation(() => LecturerProfile, { name: 'upsertLecturerProfile' })
  @RequirePermissions(Permission.Person.Update)
  async upsertLecturerProfile(
    @Args('personId', { type: () => String }) personId: string,
    @Args('input', { type: () => AdminLecturerProfileUpsertInput }) input: AdminLecturerProfileUpsertInput,
    @Context() context: GraphqlContext,
  ) {
    await this.ensurePersonExists(personId);
    const data = {
      ...this.buildProfileData(input, this.getActorId(context)),
      selfEditingBlocked: input.selfEditingBlocked ?? undefined,
    };

    return this.prisma.$transaction(async (tx) => {
      await lockReviewPerson(tx, personId);
      const existing = await tx.lecturerProfile.findUnique({ where: { personId }, select: LECTURER_PROFILE_SELECT });
      const profile = await tx.lecturerProfile.upsert({
        where: { personId },
        create: { personId, ...data, createdById: this.getActorId(context) },
        update: data,
        select: LECTURER_PROFILE_SELECT,
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.LECTURER_PROFILE,
          entityId: profile.id,
          entityLabel: profile.displayName,
          operation: existing ? AuditLogOperation.UPDATE : AuditLogOperation.CREATE,
          actor: this.getUser(context),
          before: this.toAuditSnapshot(existing),
          after: this.toAuditSnapshot(profile),
          summary: existing ? 'Perfil de palestrante atualizado.' : 'Perfil de palestrante criado.',
          scope: { permission: Permission.Person.Update },
        },
        tx,
      );
      await this.updateReview(tx, personId, existing, profile, '', true);
      return profile;
    });
  }

  @Query(() => LecturerProfile, { name: 'currentUserLecturerProfile', nullable: true })
  async currentUserLecturerProfile(@Context() context: GraphqlContext) {
    const person = await this.currentUserContext.requireCurrentPerson(context);

    const profile = await this.prisma.lecturerProfile.findUnique({
      where: { personId: person.id },
      select: LECTURER_PROFILE_SELECT,
    });
    if (!profile) return null;

    const review = await this.prisma.contentReview.findUnique({ where: { personId: person.id } });
    return { ...profile, pendingReview: !!review };
  }

  @Mutation(() => LecturerProfile, { name: 'upsertCurrentUserLecturerProfile' })
  async upsertCurrentUserLecturerProfile(
    @Args('input', { type: () => LecturerProfileUpsertInput }) input: LecturerProfileUpsertInput,
    @Context() context: GraphqlContext,
  ) {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const person = await this.currentUserContext.requireCurrentPerson(context);
    const actorId = authenticatedUser.sub;
    const data = {
      ...this.buildProfileData(input, actorId),
      googleUserPicture: this.getGoogleUserPicture(authenticatedUser, input.publishGoogleUserPicture ?? false),
    };

    const administrator = await canReviewContent(this.authorization, authenticatedUser, Permission.Person.Update);
    const { profile, review, notify } = await this.prisma.$transaction(async (tx) => {
      await lockReviewPerson(tx, person.id);
      const existing = await tx.lecturerProfile.findUnique({
        where: { personId: person.id },
        select: LECTURER_PROFILE_SELECT,
      });
      if (existing?.selfEditingBlocked) {
        throw new ForbiddenException(
          'A edição deste perfil foi bloqueada pela organização. Entre em contato para solicitar alterações.',
        );
      }
      const profile = await tx.lecturerProfile.upsert({
        where: { personId: person.id, selfEditingBlocked: false },
        create: { personId: person.id, ...data, createdById: actorId },
        update: data,
        select: LECTURER_PROFILE_SELECT,
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.LECTURER_PROFILE,
          entityId: profile.id,
          entityLabel: profile.displayName,
          operation: existing ? AuditLogOperation.UPDATE : AuditLogOperation.CREATE,
          actor: authenticatedUser,
          before: this.toAuditSnapshot(existing),
          after: this.toAuditSnapshot(profile),
          summary: existing
            ? 'Perfil de palestrante atualizado pelo usuário.'
            : 'Perfil de palestrante criado pelo usuário.',
          scope: { permission: Permission.Person.Update },
        },
        tx,
      );
      return {
        profile,
        ...(await this.updateReview(tx, person.id, existing, profile, person.name, administrator)),
      };
    });
    if (notify && review) await this.reviewNotifications.notify(review);
    return { ...profile, pendingReview: !!review };
  }

  private async updateReview(
    tx: Prisma.TransactionClient,
    personId: string,
    before: LecturerProfileAuditSnapshot | null,
    after: LecturerProfileAuditSnapshot,
    authorName: string,
    administrator: boolean,
  ) {
    const review = await tx.contentReview.findUnique({ where: { personId } });
    const baseline = before ? profileSnapshot(before) : null;
    const proposed = profileSnapshot(after);
    if (!administrator && isDeepStrictEqual(baseline, proposed)) return { review, notify: false };
    const changes = mergeProfileChanges(review, baseline, proposed, authorName, administrator);
    if (isDeepStrictEqual(changes, readChanges(review))) return { review, notify: false };
    return {
      review: await writeReview(tx, { personId }, review, changes),
      notify:
        !administrator &&
        changes.some((change) => {
          const previous = readChanges(review).find(({ key }) => key === change.key);
          return !isDeepStrictEqual(previous?.after, change.after);
        }),
    };
  }

  private async ensurePersonExists(personId: string): Promise<void> {
    const person = await this.prisma.people.findFirst({
      where: {
        id: personId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!person) {
      throw new NotFoundException(`Person ${personId} was not found.`);
    }
  }

  private toAuditSnapshot(
    profile: Prisma.LecturerProfileGetPayload<{ select: typeof LECTURER_PROFILE_SELECT }> | null,
  ): LecturerProfileAuditSnapshot | null {
    if (!profile) {
      return null;
    }

    return {
      id: profile.id,
      personId: profile.personId,
      selfEditingBlocked: profile.selfEditingBlocked,
      displayName: profile.displayName,
      biography: profile.biography,
      publishGoogleUserPicture: profile.publishGoogleUserPicture,
      googleUserPicture: profile.googleUserPicture,
      email: profile.email,
      whatsapp: profile.whatsapp,
      linkedin: profile.linkedin,
      createdAt: profile.createdAt,
      createdById: profile.createdById,
      updatedAt: profile.updatedAt,
      updatedById: profile.updatedById,
    };
  }

  private buildProfileData(input: LecturerProfileUpsertInput, actorId: string | undefined): LecturerProfileData {
    const displayName = input.displayName.trim();
    const biography = input.biography?.trim() || null;

    if (!displayName) {
      throw new BadRequestException('Display name is required.');
    }

    return {
      displayName,
      biography,
      publishGoogleUserPicture: input.publishGoogleUserPicture ?? false,
      email: this.normalizeEmail(input.email),
      whatsapp: this.normalizeWhatsapp(input.whatsapp),
      linkedin: this.normalizeLinkedin(input.linkedin),
      updatedById: actorId,
    };
  }

  private normalizeEmail(email: string | null | undefined): string | null {
    const normalized = email?.trim().toLowerCase();
    return normalized || null;
  }

  private normalizeWhatsapp(whatsapp: string | null | undefined): string | null {
    const raw = whatsapp?.trim();
    if (!raw) {
      return null;
    }

    const hasPlus = raw.startsWith('+');
    const digits = raw.replace(/\D/g, '');
    const normalized = hasPlus
      ? `+${digits}`
      : digits.length === 10 || digits.length === 11
        ? `+55${digits}`
        : `+${digits}`;

    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      throw new BadRequestException('WhatsApp must be a valid international phone number.');
    }

    return normalized;
  }

  private normalizeLinkedin(linkedin: string | null | undefined): string | null {
    const raw = linkedin?.trim();
    if (!raw) {
      return null;
    }

    const withoutAt = raw.startsWith('@') ? raw.slice(1) : raw;
    const isLinkedinUrl = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*linkedin\.com(?:\/|$)/i.test(withoutAt);
    let username = withoutAt;

    if (isLinkedinUrl) {
      let url: URL;
      try {
        url = new URL(/^https?:\/\//i.test(withoutAt) ? withoutAt : `https://${withoutAt}`);
      } catch {
        throw new BadRequestException('Informe um nome de usuário do LinkedIn ou uma URL de perfil válida.');
      }

      if (
        !['http:', 'https:'].includes(url.protocol) ||
        (url.hostname !== 'linkedin.com' && !url.hostname.endsWith('.linkedin.com')) ||
        url.username ||
        url.password ||
        url.port
      ) {
        throw new BadRequestException('Informe um nome de usuário do LinkedIn ou uma URL de perfil válida.');
      }

      const profilePath = /^\/in\/([^/]+)(?:\/.*)?$/i.exec(url.pathname);
      if (!profilePath) {
        throw new BadRequestException('Informe um nome de usuário do LinkedIn ou uma URL de perfil válida.');
      }

      try {
        username = decodeURIComponent(profilePath[1] ?? '');
      } catch {
        throw new BadRequestException('Informe um nome de usuário do LinkedIn ou uma URL de perfil válida.');
      }
    } else if (/[:/?#]/.test(withoutAt)) {
      throw new BadRequestException('Informe um nome de usuário do LinkedIn ou uma URL de perfil válida.');
    }

    if (!/^[a-z0-9-]{1,100}$/i.test(username)) {
      throw new BadRequestException('Informe um nome de usuário do LinkedIn ou uma URL de perfil válida.');
    }

    return username;
  }

  private getActorId(context: GraphqlContext): string | undefined {
    return context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;
  }

  private getUser(context: GraphqlContext): AuthenticatedUser | undefined {
    return context.req?.user ?? context.request?.user;
  }

  private getGoogleUserPicture(user: AuthenticatedUser, publish: boolean): string | null {
    if (!publish) {
      return null;
    }

    const picture = user.claims?.['picture'];
    return typeof picture === 'string' && picture.trim() ? picture.trim() : null;
  }
}
