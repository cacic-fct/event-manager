import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory, GraphQLSchemaHost } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { parse, validate } from 'graphql';
import { AdminMcpGraphqlBridge } from './graphql-bridge';
import { AdminMcpRestOperations, REST_ADMIN_OPERATION_FIELDS } from './rest-operations';
import { McpAdminConfig } from '../mcp-admin.config';
import { ADMIN_MCP_OPERATIONS } from './catalog';
import { UsageReportResolver } from '../../analytics/usage-report.resolver';
import { ContentReviewResolver } from '../../content-review/content-review.resolver';
import { EventContextResolver } from '../../event-context/event-context.resolver';
import { UsersResolver } from '../../users/resolver';
import { DashboardInsightsResolver } from '../../dashboard/insights.resolver';
import { PublicationResolver } from '../../publishing/publishing.resolver';
import { TicketPurchasesResolver } from '../../ticket-purchases/ticket-purchases.resolver';
import { CertificatesResolver } from '../../certificate/certificates.resolver';
import { CertificateCsvImportResolver } from '../../certificate/certificate-csv-import.resolver';
import { PlacePresetsResolver } from '../../places/resolver';
import { AuditLogResolver } from '../../audit-log/audit-log.resolver';
import { TicketsResolver } from '../../tickets/tickets.resolver';
import { EventFormsResolver } from '../../event-forms/event-forms.resolver';
import { SportsTournamentMutationsResolver } from '../../sports/sports-tournament-mutations.resolver';
import { EventInterestsResolver } from '../../interests/interest.resolver';
import { MajorEventsResolver } from '../../major-events/resolver';
import { SportsLifecycleMutationsResolver } from '../../sports/sports-lifecycle-mutations.resolver';
import { PrizeDrawResolver } from '../../prize-draw/prize-draw.resolver';
import { SportsParticipantMutationsResolver } from '../../sports/sports-participant-mutations.resolver';
import { SportsTeamMutationsResolver } from '../../sports/sports-team-mutations.resolver';
import { SportsAdminReadResolver } from '../../sports/read/sports-read.resolver';
import { PeopleResolver } from '../../people/resolver';
import { MajorEventReceiptsResolver } from '../../major-event-receipts/major-event-receipts.resolver';
import { SportsDuplicationMutationsResolver } from '../../sports/sports-duplication-mutations.resolver';
import { LecturerProfilesResolver } from '../../people/lecturer-profiles.resolver';
import { MergeCandidatesResolver } from '../../people/merge-candidates/resolver';
import { PermissionManagementResolver } from '../../authorization/permission-management.resolver';
import { SportsMatchAdminMutationsResolver } from '../../sports/sports-match-admin-mutations.resolver';
import { SportsReviewMutationsResolver } from '../../sports/sports-review-mutations.resolver';
import { SportsPlayerApplicationAdminReadResolver } from '../../sports/applications/sports-player-application-read.resolver';
import { EventGroupsResolver } from '../../event-groups/resolver';
import { EventSubscriberInformationResolver } from '../../events/event-subscriber-information.resolver';
import { EventsResolver } from '../../events/resolver';
import { EventAttendanceCollectorsResolver } from '../../events/attendance-collectors.resolver';
import { EventLecturersResolver } from '../../events/lecturers.resolver';
import { EventSubscriptionsResolver } from '../../events/subscriptions.resolver';
import { EventDraftsResolver } from '../../events/event-drafts.resolver';
import { EventPreparationResolver } from '../../events/event-preparation.resolver';
import { AttendanceAnalyticsResolver } from '../../events/attendances/attendance-analytics.resolver';
import { EventAttendancesMutationsResolver } from '../../events/attendances/event-attendances.mutations.resolver';
import { EventAttendanceCsvImportResolver } from '../../events/attendances/event-attendances.csv-import.resolver';
import { EventAttendancesQueriesResolver } from '../../events/attendances/event-attendances.queries.resolver';
import { MajorEventSubscriptionCsvImportResolver } from '../../events/attendances/major-event-subscription-csv-import.resolver';
import { EventManualNotificationResolver } from '../../events/event-manual-notification.resolver';
import { DataTransferService } from '../../data-transfer/data-transfer.service';

describe('administrative MCP catalog against the actual Nest schema', () => {
  it('validates every candidate field and exact projection', async () => {
    const module = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule] }).compile();
    try {
      const schema = await module
        .get(GraphQLSchemaFactory)
        .create([
          UsageReportResolver,
          ContentReviewResolver,
          EventContextResolver,
          UsersResolver,
          DashboardInsightsResolver,
          PublicationResolver,
          TicketPurchasesResolver,
          CertificatesResolver,
          CertificateCsvImportResolver,
          PlacePresetsResolver,
          AuditLogResolver,
          TicketsResolver,
          EventFormsResolver,
          SportsTournamentMutationsResolver,
          EventInterestsResolver,
          MajorEventsResolver,
          SportsLifecycleMutationsResolver,
          PrizeDrawResolver,
          SportsParticipantMutationsResolver,
          SportsTeamMutationsResolver,
          SportsAdminReadResolver,
          PeopleResolver,
          MajorEventReceiptsResolver,
          SportsDuplicationMutationsResolver,
          LecturerProfilesResolver,
          MergeCandidatesResolver,
          PermissionManagementResolver,
          SportsMatchAdminMutationsResolver,
          SportsReviewMutationsResolver,
          SportsPlayerApplicationAdminReadResolver,
          EventGroupsResolver,
          EventSubscriberInformationResolver,
          EventManualNotificationResolver,
          EventsResolver,
          EventAttendanceCollectorsResolver,
          EventLecturersResolver,
          EventSubscriptionsResolver,
          EventDraftsResolver,
          EventPreparationResolver,
          AttendanceAnalyticsResolver,
          EventAttendancesMutationsResolver,
          EventAttendanceCsvImportResolver,
          EventAttendancesQueriesResolver,
          MajorEventSubscriptionCsvImportResolver,
        ]);
      const restOperations = new AdminMcpRestOperations({} as DataTransferService);
      const bridge = new AdminMcpGraphqlBridge(
        { schema } as GraphQLSchemaHost,
        { resourceUrl: 'https://events.example.test/api/mcp/admin' } as McpAdminConfig,
        restOperations,
      );
      const coverage = bridge.coverage();
      const failures: string[] = [];
      expect(new Set(REST_ADMIN_OPERATION_FIELDS)).toEqual(
        new Set(ADMIN_MCP_OPERATIONS.filter((operation) => operation.transport === 'REST').map((entry) => entry.field)),
      );
      for (const operation of ADMIN_MCP_OPERATIONS) {
        if (operation.transport === 'REST') continue;
        const root = operation.kind === 'query' ? schema.getQueryType() : schema.getMutationType();
        const field = root?.getFields()[operation.field];
        if (!field) {
          failures.push(operation.field + ': missing actual schema field');
          continue;
        }
        const variables = field.args.map((argument) => '$' + argument.name + ': ' + String(argument.type));
        const args = field.args.map((argument) => argument.name + ': $' + argument.name);
        const declarations = variables.length ? '(' + variables.join(', ') + ')' : '';
        const invocation = args.length ? '(' + args.join(', ') + ')' : '';
        const projection = operation.selection ? '{ ' + operation.selection + ' }' : '';
        const document = parse(
          operation.kind + ' CatalogProbe' + declarations + '{ ' + operation.field + invocation + projection + ' }',
        );
        for (const error of validate(schema, document)) failures.push(operation.field + ': ' + error.message);
      }
      expect(failures).toEqual([]);
      expect(coverage).toEqual({
        candidates: ADMIN_MCP_OPERATIONS.length,
        available: ADMIN_MCP_OPERATIONS.length,
        unavailable: [],
      });
    } finally {
      await module.close();
    }
  });
});
