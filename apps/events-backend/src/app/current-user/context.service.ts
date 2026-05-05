import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import {
  GraphqlContext,
  PERSON_SELECT,
  PersonRecord,
  USER_SELECT,
  UserRecord,
} from './selects';

@Injectable()
export class CurrentUserContextService {
  constructor(private readonly prisma: PrismaService) {}

  getAuthenticatedUser(context: GraphqlContext): AuthenticatedUser {
    const user = context.req?.user ?? context.request?.user;
    if (!user) {
      throw new UnauthorizedException('Missing authenticated user context.');
    }

    return user;
  }

  async resolveCurrentUserContext(
    authenticatedUser: AuthenticatedUser,
    includeUserFallback = false,
  ): Promise<{ user: UserRecord | null; person: PersonRecord | null }> {
    const user = await this.resolveCurrentUser(authenticatedUser);
    const person =
      (await this.resolveCurrentPerson(authenticatedUser, user)) ??
      (await this.createCurrentPerson(authenticatedUser));

    if (!user && includeUserFallback && person?.user) {
      return {
        user: person.user,
        person,
      };
    }

    return { user, person };
  }

  async requireCurrentPerson(context: GraphqlContext): Promise<PersonRecord> {
    const authenticatedUser = this.getAuthenticatedUser(context);
    const { person } = await this.resolveCurrentUserContext(authenticatedUser);
    if (person) {
      return person;
    }

    return this.createCurrentPerson(authenticatedUser);
  }

  normalizeEmail(email?: string): string | undefined {
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail) {
      return undefined;
    }

    return normalizedEmail;
  }

  async createCurrentPerson(
    authenticatedUser: AuthenticatedUser,
  ): Promise<PersonRecord> {
    const profile = this.getInferredProfile(authenticatedUser);
    const name = profile.name;

    if (!name) {
      throw new BadRequestException(
        'Cannot create person context for authenticated user without identifiable name/email/sub.',
      );
    }

    const user = await this.resolveCurrentUser(authenticatedUser);
    const externalRef = profile.externalRef;

    if (externalRef) {
      const personByExternalRef = await this.prisma.people.findFirst({
        where: {
          externalRef,
          deletedAt: null,
        },
        select: PERSON_SELECT,
      });
      if (personByExternalRef) {
        return this.backfillMatchedPerson(personByExternalRef, user, profile);
      }
    }

    return this.prisma.people.create({
      data: {
        name,
        email: profile.email ?? null,
        phone: profile.phone ?? null,
        identityDocument: profile.identityDocument ?? null,
        academicId: profile.academicId ?? null,
        userId: user?.id ?? null,
        externalRef,
      },
      select: PERSON_SELECT,
    });
  }

  private async resolveCurrentUser(
    authenticatedUser: AuthenticatedUser,
  ): Promise<UserRecord | null> {
    if (authenticatedUser.sub) {
      const userById = await this.prisma.user.findUnique({
        where: {
          id: authenticatedUser.sub,
        },
        select: USER_SELECT,
      });
      if (userById) {
        return this.backfillMatchedUser(userById, authenticatedUser);
      }
    }

    const normalizedEmail = this.normalizeEmail(authenticatedUser.email);
    if (!normalizedEmail) {
      return null;
    }

    const userByEmail = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      },
      select: USER_SELECT,
    });

    if (userByEmail) {
      return this.backfillMatchedUser(userByEmail, authenticatedUser);
    }

    const profile = this.getInferredProfile(authenticatedUser);
    if (!authenticatedUser.sub || !profile.name) {
      return null;
    }

    return this.prisma.user.create({
      data: {
        id: authenticatedUser.sub,
        email: normalizedEmail,
        name: profile.name,
        identityDocument: profile.identityDocument ?? null,
        academicId: profile.academicId ?? null,
      },
      select: USER_SELECT,
    });
  }

  private async resolveCurrentPerson(
    authenticatedUser: AuthenticatedUser,
    linkedUser?: UserRecord | null,
  ): Promise<PersonRecord | null> {
    const resolvedUserId = linkedUser?.id ?? authenticatedUser.sub;
    if (resolvedUserId) {
      const linkedPeople = await this.prisma.people.findMany({
        where: {
          userId: resolvedUserId,
          deletedAt: null,
        },
        select: PERSON_SELECT,
        take: 2,
      });

      if (linkedPeople.length > 1) {
        throw new ConflictException(
          `Multiple people records are linked to user ${resolvedUserId}.`,
        );
      }

      if (linkedPeople.length === 1) {
        return linkedPeople[0];
      }
    }

    const profile = this.getInferredProfile(authenticatedUser);
    if (profile.externalRef) {
      const personByExternalRef = await this.prisma.people.findFirst({
        where: {
          externalRef: profile.externalRef,
          deletedAt: null,
        },
        select: PERSON_SELECT,
      });

      if (personByExternalRef) {
        return this.backfillMatchedPerson(
          personByExternalRef,
          linkedUser ?? null,
          profile,
        );
      }
    }

    const normalizedEmail = this.normalizeEmail(authenticatedUser.email);
    if (normalizedEmail) {
      const peopleByEmail = await this.prisma.people.findMany({
        where: {
          deletedAt: null,
          OR: [
            {
              email: {
                equals: normalizedEmail,
                mode: 'insensitive',
              },
            },
            {
              secondaryEmails: {
                has: normalizedEmail,
              },
            },
          ],
        },
        select: PERSON_SELECT,
        take: 2,
      });

      if (peopleByEmail.length > 1) {
        throw new ConflictException(
          `Multiple people records match email ${normalizedEmail}.`,
        );
      }

      if (peopleByEmail[0]) {
        return this.backfillMatchedPerson(
          peopleByEmail[0],
          linkedUser ?? null,
          profile,
        );
      }
    }

    const identityDocumentMatches = this.getIdentityDocumentMatches(
      profile.identityDocument,
    );
    if (identityDocumentMatches.length === 0) {
      return null;
    }

    const peopleByIdentityDocument = await this.prisma.people.findMany({
      where: {
        deletedAt: null,
        identityDocument: {
          in: identityDocumentMatches,
        },
      },
      select: PERSON_SELECT,
      take: 2,
    });

    if (peopleByIdentityDocument.length > 1) {
      throw new ConflictException(
        `Multiple people records match identity document ${profile.identityDocument}.`,
      );
    }

    if (peopleByIdentityDocument[0]) {
      return this.backfillMatchedPerson(
        peopleByIdentityDocument[0],
        linkedUser ?? null,
        profile,
      );
    }

    return null;
  }

  private async backfillMatchedUser(
    user: UserRecord,
    authenticatedUser: AuthenticatedUser,
  ): Promise<UserRecord> {
    const profile = this.getInferredProfile(authenticatedUser);
    const data: {
      name?: string;
      identityDocument?: string;
      academicId?: string;
    } = {};

    // Treat name from Keycloak as source of truth - always update if available
    if (profile.fullname) {
      data.name = profile.fullname;
    }
    if (!user.identityDocument && profile.identityDocument) {
      data.identityDocument = profile.identityDocument;
    }
    if (!user.academicId && profile.academicId) {
      data.academicId = profile.academicId;
    }

    if (Object.keys(data).length === 0) {
      return user;
    }

    return this.prisma.user.update({
      where: {
        id: user.id,
      },
      data,
      select: USER_SELECT,
    });
  }

  private async backfillMatchedPerson(
    person: PersonRecord,
    user: UserRecord | null,
    profile: InferredAuthenticatedProfile,
  ): Promise<PersonRecord> {
    if (person.userId && user?.id && person.userId !== user.id) {
      throw new ConflictException(
        `Person ${person.id} is already linked to another user.`,
      );
    }

    const data: {
      name?: string;
      email?: string | null;
      phone?: string | null;
      identityDocument?: string | null;
      academicId?: string | null;
      userId?: string | null;
      externalRef?: string | null;
      secondaryEmails?: string[];
    } = {};

    // Treat name from Keycloak as source of truth - always update if available
    if (profile.fullname) {
      data.name = profile.fullname;
    }

    // Handle email as source of truth - always update if available
    // If email is changing, migrate old email to secondary emails
    if (profile.email && profile.email !== person.email) {
      // Move old email to secondary emails if it exists
      if (person.email) {
        data.secondaryEmails = this.addToSecondaryEmails(
          person.secondaryEmails,
          person.email,
        );
      }
      data.email = profile.email;
    } else if (profile.email && !person.email) {
      // Email from Keycloak, person didn't have one
      data.email = profile.email;
    }

    if (!person.phone && profile.phone) {
      data.phone = profile.phone;
    }
    if (!person.identityDocument && profile.identityDocument) {
      data.identityDocument = profile.identityDocument;
    }
    if (!person.academicId && profile.academicId) {
      data.academicId = profile.academicId;
    }
    if (!person.userId && user?.id) {
      data.userId = user.id;
    }
    if (!person.externalRef && profile.externalRef) {
      data.externalRef = profile.externalRef;
    }

    if (Object.keys(data).length === 0) {
      return person;
    }

    return this.prisma.people.update({
      where: {
        id: person.id,
      },
      data,
      select: PERSON_SELECT,
    });
  }

  private getInferredProfile(
    authenticatedUser: AuthenticatedUser,
  ): InferredAuthenticatedProfile {
    const email = this.normalizeEmail(authenticatedUser.email);
    const name =
      this.readStringClaim(authenticatedUser.claims, 'name') ??
      authenticatedUser.preferredUsername?.trim() ??
      email ??
      authenticatedUser.sub?.trim();

    return {
      name,
      fullname: this.readStringClaim(authenticatedUser.claims, 'set_fullname'),
      email,
      phone: this.readStringClaim(authenticatedUser.claims, 'phone'),
      identityDocument: this.readStringClaim(
        authenticatedUser.claims,
        'identityDocument',
      ),
      academicId: this.readStringClaim(
        authenticatedUser.claims,
        'enrollmentNumber',
      ),
      externalRef: authenticatedUser.sub?.trim()
        ? `kc:${authenticatedUser.sub.trim()}`
        : null,
    };
  }

  private readStringClaim(
    claims: Record<string, unknown>,
    claimName: string,
  ): string | undefined {
    const value = claims[claimName];
    if (typeof value === 'string') {
      return this.trimToUndefined(value);
    }

    if (Array.isArray(value)) {
      const firstString = value.find((item) => typeof item === 'string');
      return typeof firstString === 'string'
        ? this.trimToUndefined(firstString)
        : undefined;
    }

    return undefined;
  }

  private trimToUndefined(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  private getIdentityDocumentMatches(identityDocument?: string): string[] {
    if (!identityDocument) {
      return [];
    }

    const matches = new Set([identityDocument]);
    const digitsOnly = identityDocument.replace(/\D/g, '');
    if (digitsOnly.length === 11) {
      matches.add(digitsOnly);
    }

    return Array.from(matches);
  }

  /**
   * Adds an email to the secondary emails array without duplicates.
   * Treats email comparisons as case-insensitive to prevent duplicate email variations.
   * @param secondaryEmails Current array of secondary emails
   * @param emailToAdd Email to add
   * @returns Updated secondary emails array
   */
  private addToSecondaryEmails(
    secondaryEmails: string[],
    emailToAdd?: string,
  ): string[] {
    if (!emailToAdd) {
      return secondaryEmails;
    }

    const normalizedNewEmail = this.normalizeEmail(emailToAdd);
    if (!normalizedNewEmail) {
      return secondaryEmails;
    }

    // Check if email already exists (case-insensitive)
    const emailExists = secondaryEmails.some(
      (email) => this.normalizeEmail(email) === normalizedNewEmail,
    );

    if (emailExists) {
      return secondaryEmails;
    }

    return [...secondaryEmails, normalizedNewEmail];
  }
}

type InferredAuthenticatedProfile = {
  name?: string;
  fullname?: string;
  email?: string;
  phone?: string;
  identityDocument?: string;
  academicId?: string;
  externalRef: string | null;
};
