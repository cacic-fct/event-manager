import { createHash } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { canonicalTransferJson, transferPersonDataError } from '@cacic-fct/shared-data-transfer';
import { Permission } from '@cacic-fct/shared-permissions';
import type { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { mergeSecondaryEmails } from '../people/merge-candidates/operations/migration';
import type { PersonTransferMatcherService, TransferPersonReference } from './person-transfer-matcher.service';
import { normalizeTransferPerson, transferPersonKey, transferPersonId } from './transfer-person-creation';
import { TransferValidationException } from './transfer-validation.exception';
import type { DataTransferAdapter, ResolvedTransferResource, TransferAdapterContext } from './data-transfer-adapter';

/** Shared person review for subscriptions, attendance, and independently purchased tickets. */
export async function resolveTransferPerson<Snapshot extends ResolvedTransferResource>(
  reference: TransferPersonReference,
  base: Snapshot,
  context: TransferAdapterContext,
  authorization: AuthorizationPolicyService,
  people: PersonTransferMatcherService,
  adapter: Pick<DataTransferAdapter, 'assertWrite' | 'assertMutable'>,
): Promise<Snapshot & { personId?: string }> {
  const match = await people.match(reference, context.tx);
  const decision = context.personDecisions?.find((choice) => choice.key === transferPersonKey(reference));
  if (decision?.action === 'skip')
    return { ...base, skip: { message: 'Registros desta pessoa ignorados por sua escolha.' } };
  let personId: string;
  if ('message' in match) {
    if (!match.missing && !match.reviewIds?.length) return { ...base, skip: { message: match.message } };
    await authorization.assertPermissions(context.actor, [Permission.Person.Read]);
    await adapter.assertWrite(base, 'create', context);
    await adapter.assertMutable(base, 'edit', context);
    const submittedData = { ...reference, ...(decision ? decision.data : {}) };
    const data = normalizeTransferPerson(submittedData);
    // Extra form data can reveal a match that was absent from the original file.
    const effectiveMatch = decision ? await people.match(submittedData, context.tx) : match;
    const reviewIds = 'id' in effectiveMatch ? [effectiveMatch.id] : (effectiveMatch.reviewIds ?? []);
    const canCreate = await canManagePerson(authorization, context, Permission.Person.Create);
    const canMerge = reviewIds.length > 0 && (await canManagePerson(authorization, context, Permission.Person.Update));
    if (!canCreate && !canMerge)
      return {
        ...base,
        skip: { message: 'Você precisa de permissão para criar ou atualizar pessoas para resolver estes dados.' },
      };
    const candidates = reviewIds.length ? await people.reviewCandidates(reviewIds, context.tx) : [];
    const reviewHash = createHash('sha256')
      .update(
        canonicalTransferJson({
          key: transferPersonKey(reference),
          candidates: candidates
            .map((candidate) => ({ ...candidate, updatedAt: candidate.updatedAt.toISOString() }))
            .sort((left, right) => left.id.localeCompare(right.id)),
        }),
      )
      .digest('hex');
    const original = normalizeTransferPerson(reference);
    if (Object.entries(original).some(([field, value]) => data[field as keyof typeof data] !== value))
      throw new TransferValidationException(
        'Preserve os identificadores do arquivo ao complementar os dados da pessoa.',
      );
    const prompt = (message: string): Snapshot & { personId?: string } => ({
      ...base,
      personPrompt: {
        key: transferPersonKey(reference),
        data,
        message,
        canCreate,
        canMerge,
        reviewHash,
        lockedFields: Object.keys(original) as Array<keyof typeof original>,
        ...(candidates.length
          ? {
              candidates: candidates.map((candidate) => ({
                id: candidate.id,
                name: candidate.name,
                ...(candidate.email ? { email: candidate.email } : {}),
                ...(candidate.phone ? { phone: candidate.phone } : {}),
                ...(candidate.academicId ? { academicId: candidate.academicId } : {}),
                ...(candidate.identityDocument ? { identityDocument: candidate.identityDocument } : {}),
              })),
            }
          : {}),
      },
      skip: { message },
    });
    if (!decision)
      return prompt(
        candidates.length
          ? 'O nome corresponde a cadastros existentes, mas os dados exigem revisão. Escolha criar outra pessoa, mesclar os dados ou ignorar.'
          : (transferPersonDataError(data) ?? match.message),
      );
    if (candidates.length && decision.reviewHash !== reviewHash)
      return prompt(
        'Os dados complementares correspondem a pessoas existentes. Revise os cadastros apresentados e confirme sua escolha novamente.',
      );
    const error = transferPersonDataError(data, decision.action === 'create');
    if (error) return prompt(error);
    if (decision.action === 'merge') {
      await authorization.assertPermissions(context.actor, [Permission.Person.Update]);
      const selected = candidates.find((candidate) => candidate.id === decision.personId);
      if (!selected) return prompt('Selecione uma das pessoas correspondentes ao nome para mesclar os dados.');
      if (selected.userId) {
        const currentData = normalizeTransferPerson(selected);
        const changesManagedFields = (['phone', 'identityDocument', 'academicId'] as const).some(
          (field) => data[field] && data[field] !== currentData[field],
        );
        if (changesManagedFields)
          return prompt(
            'Esta pessoa está vinculada a uma conta. Telefone, documento e matrícula devem ser atualizados na conta antes da importação.',
          );
      }
      if (await people.hasReservedIdentity(submittedData, context.tx, selected.id, false))
        return prompt('Um identificador pertence a outra pessoa. Corrija os dados antes de mesclar.');
      for (const field of ['identityDocument', 'academicId'] as const) {
        if (
          data[field] &&
          selected[field] &&
          normalizeTransferPerson({ [field]: selected[field] })[field] !== data[field]
        )
          return prompt('A matrícula ou o documento difere do cadastro escolhido. Corrija os dados antes de mesclar.');
      }
      personId = selected.id;
      const secondaryEmails = mergeSecondaryEmails([], selected, { email: data.email ?? null });
      const update = {
        secondaryEmails,
        ...(data.phone && !selected.userId ? { phone: data.phone } : {}),
        ...(data.identityDocument && !selected.identityDocument ? { identityDocument: data.identityDocument } : {}),
        ...(data.academicId && !selected.academicId ? { academicId: data.academicId } : {}),
      };
      base.personMerge = {
        id: personId,
        revision: createHash('sha256')
          .update(canonicalTransferJson({ ...selected, updatedAt: selected.updatedAt.toISOString() }))
          .digest('hex'),
        data: update,
      };
      base.additionalChanges = [
        {
          field: 'Dados mesclados da pessoa',
          before: {
            email: selected.email,
            secondaryEmails: selected.secondaryEmails,
            phone: selected.phone,
            identityDocument: selected.identityDocument,
            academicId: selected.academicId,
          },
          after: { email: selected.email, ...update },
        },
      ];
    } else {
      await authorization.assertPermissions(context.actor, [Permission.Person.Create]);
      // Names may belong to different people. A manual new-person choice cannot duplicate another identifier.
      const enriched = effectiveMatch;
      if (!('message' in enriched))
        return prompt('Os dados agora correspondem a uma pessoa existente. Revise o arquivo para usar esse cadastro.');
      if (await people.hasReservedIdentity(submittedData, context.tx, undefined, false))
        return prompt(
          'Um identificador já está cadastrado. Escolha mesclar com a pessoa correspondente ou corrija os dados.',
        );
      if (!data.name || !context.actor.sub) throw new ForbiddenException();
      personId = transferPersonId(context.actor.sub, data);
      base.personCreation = { id: personId, data: { ...data, name: data.name } };
      base.additionalChanges = [{ field: 'Nova pessoa', before: null, after: { ...data, id: personId } }];
    }
  } else {
    personId = match.id;
  }
  return { ...base, personId };
}

async function canManagePerson(
  authorization: AuthorizationPolicyService,
  context: TransferAdapterContext,
  permission: Permission,
): Promise<boolean> {
  try {
    await authorization.assertPermissions(context.actor, [permission]);
    return true;
  } catch (error) {
    if (error instanceof ForbiddenException) return false;
    throw error;
  }
}
