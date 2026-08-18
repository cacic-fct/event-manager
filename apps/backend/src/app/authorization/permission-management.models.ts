import { Field, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { EventManagerPermissionScope } from '@prisma/client';

registerEnumType(EventManagerPermissionScope, { name: 'EventManagerPermissionScope' });

@ObjectType()
export class PermissionManagementPerson {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  email?: string | null;

  @Field(() => Boolean)
  hasLinkedUser!: boolean;
}

@ObjectType()
export class PermissionRoleScope {
  @Field(() => String)
  id!: string;

  @Field(() => EventManagerPermissionScope)
  scope!: EventManagerPermissionScope;

  @Field(() => String, { nullable: true })
  eventId?: string | null;

  @Field(() => String, { nullable: true })
  majorEventId?: string | null;

  @Field(() => String, { nullable: true })
  eventGroupId?: string | null;

  @Field(() => String, { nullable: true })
  targetLabel?: string | null;

  @Field(() => Date, { nullable: true })
  validFrom?: Date | null;

  @Field(() => Date, { nullable: true })
  validUntil?: Date | null;

  @Field(() => Boolean)
  unlimited!: boolean;

  @Field(() => Date, { nullable: true })
  archivedAt?: Date | null;
}

@ObjectType()
export class PermissionRoleAssignment {
  @Field(() => String)
  id!: string;

  @Field(() => String, { nullable: true })
  personId?: string | null;

  @Field(() => String, { nullable: true })
  groupId?: string | null;

  @Field(() => String)
  subjectName!: string;

  @Field(() => Boolean)
  subjectHasLinkedUser!: boolean;

  @Field(() => Date, { nullable: true })
  validFrom?: Date | null;

  @Field(() => Date, { nullable: true })
  validUntil?: Date | null;

  @Field(() => Boolean)
  unlimited!: boolean;

  @Field(() => Date, { nullable: true })
  archivedAt?: Date | null;

  @Field(() => [PermissionRoleScope])
  scopes!: PermissionRoleScope[];
}

@ObjectType()
export class PermissionRole {
  @Field(() => String)
  id!: string;

  @Field(() => String, { nullable: true })
  systemKey?: string | null;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  description!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => Boolean)
  isSystem!: boolean;

  @Field(() => Boolean)
  isExternal!: boolean;

  @Field(() => Boolean)
  assignable!: boolean;

  @Field(() => Int)
  version!: number;

  @Field(() => [String])
  permissions!: string[];

  @Field(() => [String])
  inheritedPermissions!: string[];

  @Field(() => [String])
  parentRoleIds!: string[];

  @Field(() => [PermissionRoleAssignment])
  assignments!: PermissionRoleAssignment[];

  @Field(() => Int)
  directPeopleCount!: number;

  @Field(() => Int)
  groupPeopleCount!: number;

  @Field(() => Date, { nullable: true })
  archivedAt?: Date | null;

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType()
export class PermissionGroupMember {
  @Field(() => String)
  id!: string;

  @Field(() => PermissionManagementPerson)
  person!: PermissionManagementPerson;

  @Field(() => Date, { nullable: true })
  validFrom?: Date | null;

  @Field(() => Date, { nullable: true })
  validUntil?: Date | null;

  @Field(() => Boolean)
  unlimited!: boolean;

  @Field(() => Date, { nullable: true })
  archivedAt?: Date | null;
}

@ObjectType()
export class PermissionGroup {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  description!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => Int)
  version!: number;

  @Field(() => [PermissionGroupMember])
  members!: PermissionGroupMember[];

  @Field(() => [String])
  assignedRoleIds!: string[];

  @Field(() => Date, { nullable: true })
  archivedAt?: Date | null;

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType()
export class PermissionScopeTarget {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  label!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String, { nullable: true })
  emoji?: string | null;

  @Field(() => String, { nullable: true })
  parentId?: string | null;
}

@InputType()
export class PermissionRoleScopeInput {
  @Field(() => String, { nullable: true })
  id?: string | null;

  @Field(() => EventManagerPermissionScope)
  scope!: EventManagerPermissionScope;

  @Field(() => String, { nullable: true })
  eventId?: string | null;

  @Field(() => String, { nullable: true })
  majorEventId?: string | null;

  @Field(() => String, { nullable: true })
  eventGroupId?: string | null;

  @Field(() => Date, { nullable: true })
  validFrom?: Date | null;

  @Field(() => Date, { nullable: true })
  validUntil?: Date | null;

  @Field(() => Boolean)
  unlimited!: boolean;
}

@InputType()
export class PermissionRoleAssignmentInput {
  @Field(() => String, { nullable: true })
  id?: string | null;

  @Field(() => String, { nullable: true })
  personId?: string | null;

  @Field(() => String, { nullable: true })
  groupId?: string | null;

  @Field(() => Date, { nullable: true })
  validFrom?: Date | null;

  @Field(() => Date, { nullable: true })
  validUntil?: Date | null;

  @Field(() => Boolean)
  unlimited!: boolean;

  @Field(() => [PermissionRoleScopeInput])
  scopes!: PermissionRoleScopeInput[];
}

@InputType()
export class PermissionRoleSaveInput {
  @Field(() => String, { nullable: true })
  id?: string | null;

  @Field(() => Int, { nullable: true })
  expectedVersion?: number | null;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  description!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => [String])
  permissions!: string[];

  @Field(() => [String])
  parentRoleIds!: string[];

  @Field(() => [PermissionRoleAssignmentInput])
  assignments!: PermissionRoleAssignmentInput[];
}

@InputType()
export class PermissionGroupMemberInput {
  @Field(() => String, { nullable: true })
  id?: string | null;

  @Field(() => String)
  personId!: string;

  @Field(() => Date, { nullable: true })
  validFrom?: Date | null;

  @Field(() => Date, { nullable: true })
  validUntil?: Date | null;

  @Field(() => Boolean)
  unlimited!: boolean;
}

@InputType()
export class PermissionGroupSaveInput {
  @Field(() => String, { nullable: true })
  id?: string | null;

  @Field(() => Int, { nullable: true })
  expectedVersion?: number | null;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  description!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => [PermissionGroupMemberInput])
  members!: PermissionGroupMemberInput[];
}
