import { LecturerProfile, LecturerProfileUpsertInput } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUserContextService } from '../current-user/context.service';
import { GraphqlContext } from '../current-user/selects';
import { PrismaService } from '../prisma/prisma.service';

const LECTURER_PROFILE_SELECT = {
  id: true,
  personId: true,
  person: {
    include: {
      user: true,
    },
  },
  displayName: true,
  biography: true,
  publishGoogleUserPicture: true,
  googleUserPicture: true,
  email: true,
  whatsapp: true,
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
  googleUserPicture?: string | null;
  updatedById: string | undefined;
}

type LecturerProfileAuditSnapshot = Pick<
  Prisma.LecturerProfileGetPayload<{ select: typeof LECTURER_PROFILE_SELECT }>,
  | 'id'
  | 'personId'
  | 'displayName'
  | 'biography'
  | 'publishGoogleUserPicture'
  | 'googleUserPicture'
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
    private readonly auditLog: AuditLogService = { record: async () => undefined } as unknown as AuditLogService,
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
    @Args('input', { type: () => LecturerProfileUpsertInput }) input: LecturerProfileUpsertInput,
    @Context() context: GraphqlContext,
  ) {
    await this.ensurePersonExists(personId);
    const data = this.buildProfileData(input, this.getActorId(context));

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.lecturerProfile.findUnique({ where: { personId }, select: LECTURER_PROFILE_SELECT });
      const profile = await tx.lecturerProfile.upsert({
        where: { personId },
        create: { personId, ...data, createdById: this.getActorId(context) },
        update: data,
        select: LECTURER_PROFILE_SELECT,
      });
      await this.auditLog.record({
        entityType: AuditLogEntityType.LECTURER_PROFILE,
        entityId: profile.id,
        entityLabel: profile.displayName,
        operation: existing ? AuditLogOperation.UPDATE : AuditLogOperation.CREATE,
        actor: this.getUser(context),
        before: this.toAuditSnapshot(existing),
        after: this.toAuditSnapshot(profile),
        summary: existing ? 'Perfil de palestrante atualizado.' : 'Perfil de palestrante criado.',
        scope: { permission: Permission.Person.Update },
      }, tx);
      return profile;
    });
  }

  @Query(() => LecturerProfile, { name: 'currentUserLecturerProfile', nullable: true })
  async currentUserLecturerProfile(@Context() context: GraphqlContext) {
    const person = await this.currentUserContext.requireCurrentPerson(context);

    return this.prisma.lecturerProfile.findUnique({
      where: {
        personId: person.id,
      },
      select: LECTURER_PROFILE_SELECT,
    });
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

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.lecturerProfile.findUnique({
        where: { personId: person.id },
        select: LECTURER_PROFILE_SELECT,
      });
      const profile = await tx.lecturerProfile.upsert({
        where: { personId: person.id },
        create: { personId: person.id, ...data, createdById: actorId },
        update: data,
        select: LECTURER_PROFILE_SELECT,
      });
      await this.auditLog.record({
        entityType: AuditLogEntityType.LECTURER_PROFILE,
        entityId: profile.id,
        entityLabel: profile.displayName,
        operation: existing ? AuditLogOperation.UPDATE : AuditLogOperation.CREATE,
        actor: authenticatedUser,
        before: this.toAuditSnapshot(existing),
        after: this.toAuditSnapshot(profile),
        summary: existing ? 'Perfil de palestrante atualizado pelo usuário.' : 'Perfil de palestrante criado pelo usuário.',
        scope: { permission: Permission.Person.Update },
      }, tx);
      return profile;
    });
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
      displayName: profile.displayName,
      biography: profile.biography,
      publishGoogleUserPicture: profile.publishGoogleUserPicture,
      googleUserPicture: profile.googleUserPicture,
      createdAt: profile.createdAt,
      createdById: profile.createdById,
      updatedAt: profile.updatedAt,
      updatedById: profile.updatedById,
    };
  }

  private buildProfileData(
    input: LecturerProfileUpsertInput,
    actorId: string | undefined,
  ): LecturerProfileData {
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
    const normalized = hasPlus ? `+${digits}` : digits.length === 10 || digits.length === 11 ? `+55${digits}` : `+${digits}`;

    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      throw new BadRequestException('WhatsApp must be a valid international phone number.');
    }

    return normalized;
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
