import {
  PersonLinkedDataSummary,
  PersonLinkedResourcePage,
} from '@cacic-fct/shared-data-types';
import { resolvePagination } from '../common/pagination';
import {
  getLinkedResourceGroupDefinition,
  PERSON_LINKED_RESOURCE_GROUPS,
  PersonLinkedResourcePrisma,
} from './people-linked-resource-definitions';
import { countPersonLinkedResourceGroups } from './people-linked-resource-counts';
import { buildPersonLinkedResourceGroups } from './people-linked-resource-groups';

export { personHasLinkedData } from './people-linked-resource-counts';

export async function buildPersonLinkedDataSummary(
  prisma: PersonLinkedResourcePrisma,
  personId: string,
  hasDeletePermission: boolean,
): Promise<PersonLinkedDataSummary> {
  const counts = await countPersonLinkedResourceGroups(prisma, personId);
  const groups = PERSON_LINKED_RESOURCE_GROUPS.map((definition) => ({
    ...definition,
    items: [],
    totalCount: counts[definition.type] ?? 0,
  })).filter((group) => group.totalCount > 0);
  const totalCount = groups.reduce((sum, group) => sum + group.totalCount, 0);

  return {
    personId,
    groups,
    totalCount,
    hasLinkedData: totalCount > 0,
    canDelete: hasDeletePermission && totalCount === 0,
  };
}

export async function buildPersonLinkedResourcePage(
  prisma: PersonLinkedResourcePrisma,
  personId: string,
  type: string,
  skip?: number,
  take?: number,
): Promise<PersonLinkedResourcePage> {
  const definition = getLinkedResourceGroupDefinition(type);
  const pagination = resolvePagination(skip, take);
  const groups = await buildPersonLinkedResourceGroups(prisma, personId);
  const group = groups.find((item) => item.type === definition.type);
  const items = group?.items ?? [];

  return {
    personId,
    type: definition.type,
    label: definition.label,
    icon: definition.icon,
    items: items.slice(pagination.skip, pagination.skip + pagination.take),
    total: group?.totalCount ?? 0,
    skip: pagination.skip,
    take: pagination.take,
  };
}
