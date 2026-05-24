import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

@Injectable()
export class AuthenticatedUserSyncService {
  private readonly logger = new Logger(AuthenticatedUserSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async syncLoginClaims(user: AuthenticatedUser): Promise<void> {
    if (!user.sub) {
      return;
    }

    try {
      const existingUser = await this.prisma.user.findUnique({
        where: {
          id: user.sub,
        },
        select: {
          id: true,
          name: true,
          identityDocument: true,
          academicId: true,
          unespRole: true,
        },
      });
      if (!existingUser) {
        return;
      }

      const data = this.buildUserUpdateData(existingUser, user);
      if (Object.keys(data).length === 0) {
        return;
      }

      await this.prisma.user.updateMany({
        where: {
          id: user.sub,
        },
        data,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to sync Keycloak claims for user ${user.sub}.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  getInferredProfile(authenticatedUser: AuthenticatedUser): InferredAuthenticatedProfile {
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
      identityDocument: this.readStringClaim(authenticatedUser.claims, 'identityDocument'),
      academicId: this.readStringClaim(authenticatedUser.claims, 'enrollmentNumber'),
      unespRole: this.readStringArrayClaim(authenticatedUser.claims, 'unesp_role'),
      externalRef: authenticatedUser.sub?.trim() ? `kc:${authenticatedUser.sub.trim()}` : null,
    };
  }

  buildUserUpdateData(user: UserClaimSyncRecord, authenticatedUser: AuthenticatedUser): UserClaimSyncUpdateData {
    const profile = this.getInferredProfile(authenticatedUser);
    const data: UserClaimSyncUpdateData = {};

    if (profile.fullname) {
      data.name = profile.fullname;
    }
    if (!user.identityDocument && profile.identityDocument) {
      data.identityDocument = profile.identityDocument;
    }
    if (!user.academicId && profile.academicId) {
      data.academicId = profile.academicId;
    }
    if (!this.sameStringArray(user.unespRole, profile.unespRole)) {
      data.unespRole = profile.unespRole;
    }

    return data;
  }

  private normalizeEmail(email?: string): string | undefined {
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail) {
      return undefined;
    }

    return normalizedEmail;
  }

  private readStringClaim(claims: Record<string, unknown>, claimName: string): string | undefined {
    const value = claims[claimName];
    if (typeof value === 'string') {
      return this.trimToUndefined(value);
    }

    if (Array.isArray(value)) {
      const firstString = value.find((item) => typeof item === 'string');
      return typeof firstString === 'string' ? this.trimToUndefined(firstString) : undefined;
    }

    return undefined;
  }

  private readStringArrayClaim(claims: Record<string, unknown>, claimName: string): string[] {
    const value = claims[claimName];
    if (typeof value === 'string') {
      const trimmed = this.trimToUndefined(value);
      return trimmed ? [trimmed] : [];
    }

    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  }

  private sameStringArray(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  private trimToUndefined(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
}

export type UserClaimSyncRecord = {
  identityDocument: string | null;
  academicId: string | null;
  unespRole: string[];
};

export type UserClaimSyncUpdateData = {
  name?: string;
  identityDocument?: string;
  academicId?: string;
  unespRole?: string[];
};

export type InferredAuthenticatedProfile = {
  name?: string;
  fullname?: string;
  email?: string;
  phone?: string;
  identityDocument?: string;
  academicId?: string;
  unespRole: string[];
  externalRef: string | null;
};
