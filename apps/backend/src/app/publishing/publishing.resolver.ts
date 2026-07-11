import { PublicationTargetType } from '@cacic-fct/shared-data-types';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { GraphqlContext } from '../current-user/selects';
import { PublicationService } from './publishing.service';
import {
  PublishContentPreviewInput,
  PublishContentPreviewPayload,
  PublishContentPreviewResult,
  PublishContentWorkspace,
  PublicationActionResult,
  PublicationBulkInput,
  PublicationStateInput,
} from './publishing.models';

@Resolver()
export class PublicationResolver {
  constructor(private readonly publication: PublicationService) {}

  @Query(() => PublishContentWorkspace, {
    name: 'publishContentWorkspace',
    description: 'Publication orchestration tree, status board, and consistency warnings for public content.',
  })
  publishContentWorkspace(
    @Context() context: GraphqlContext,
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
    @Args('focusTargetType', { type: () => PublicationTargetType, nullable: true })
    focusTargetType?: PublicationTargetType,
    @Args('focusTargetId', { type: () => String, nullable: true }) focusTargetId?: string,
  ): Promise<PublishContentWorkspace> {
    return this.publication.getWorkspace(context, {
      query,
      skip,
      take,
      focusTargetType,
      focusTargetId,
    });
  }

  @Mutation(() => PublicationActionResult, {
    name: 'setPublicationState',
    description: 'Moves an event, event group children, or major event to draft, scheduled, published, or unpublished.',
  })
  setPublicationState(
    @Args('input', { type: () => PublicationStateInput }) input: PublicationStateInput,
    @Context() context: GraphqlContext,
  ): Promise<PublicationActionResult> {
    return this.publication.setPublicationState(input, context);
  }

  @Mutation(() => PublicationActionResult, {
    name: 'runPublicationBulkOperation',
    description: 'Runs explicit bundle operations such as scheduling or unpublishing a whole bundle.',
  })
  runPublicationBulkOperation(
    @Args('input', { type: () => PublicationBulkInput }) input: PublicationBulkInput,
    @Context() context: GraphqlContext,
  ): Promise<PublicationActionResult> {
    return this.publication.runBulkOperation(input, context);
  }

  @Mutation(() => PublishContentPreviewResult, {
    name: 'createPublishContentPreview',
    description: 'Creates or refreshes a temporary public preview link for an authenticated administrator.',
  })
  createPublishContentPreview(
    @Args('input', { type: () => PublishContentPreviewInput }) input: PublishContentPreviewInput,
    @Context() context: GraphqlContext,
  ): Promise<PublishContentPreviewResult> {
    return this.publication.createPreview(input, context);
  }

  @Query(() => PublishContentPreviewPayload, {
    name: 'publishContentPreview',
    description: 'Loads a temporary preview payload authorized by its token and expiration.',
  })
  publishContentPreview(
    @Args('previewToken', { type: () => String }) previewToken: string,
  ): Promise<PublishContentPreviewPayload> {
    return this.publication.getPreviewPayload(previewToken);
  }
}
