import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Kind, parse, visit } from 'graphql';
import ts from 'typescript';
import { ADMIN_MCP_EXCLUSIONS, ADMIN_MCP_OPERATIONS } from './catalog';
import { REST_ADMIN_OPERATION_FIELDS } from './rest-operations';

function sourceFile(path: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    readFileSync(resolve(process.cwd(), '../..', path), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
}

function operationMethods(source: ts.SourceFile): Map<string, ts.MethodDeclaration> {
  const methods = new Map<string, ts.MethodDeclaration>();
  const collect = (node: ts.Node) => {
    if (ts.isMethodDeclaration(node)) {
      for (const decorator of ts.getDecorators(node) ?? []) {
        const expression = decorator.expression;
        if (
          !ts.isCallExpression(expression) ||
          !['Query', 'Mutation'].includes(expression.expression.getText(source))
        ) {
          continue;
        }
        let name = node.name.getText(source);
        const options = expression.arguments[1];
        if (options && ts.isObjectLiteralExpression(options)) {
          const property = options.properties.find((item) => item.name?.getText(source) === 'name');
          if (property && ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)) {
            name = property.initializer.text;
          }
        }
        methods.set(name, node);
      }
    }
    ts.forEachChild(node, collect);
  };
  collect(source);
  return methods;
}

function projectionPaths(field: string): Set<string> {
  const operation = ADMIN_MCP_OPERATIONS.find((entry) => entry.field === field);
  if (!operation?.selection) return new Set();
  const document = parse(`query CatalogProjection { operation { ${operation.selection} } }`);
  const definition = document.definitions[0];
  if (definition.kind !== Kind.OPERATION_DEFINITION) return new Set();
  const root = definition.selectionSet.selections.find(
    (selection) => selection.kind === Kind.FIELD && selection.name.value === 'operation',
  );
  if (!root || root.kind !== Kind.FIELD || !root.selectionSet) return new Set();
  const paths = new Set<string>();
  const collect = (selectionSet: typeof root.selectionSet, parent = '') => {
    if (!selectionSet) return;
    for (const selection of selectionSet.selections) {
      if (selection.kind !== Kind.FIELD) continue;
      const path = parent ? `${parent}.${selection.name.value}` : selection.name.value;
      paths.add(path);
      if (selection.selectionSet) collect(selection.selectionSet, path);
    }
  };
  collect(root.selectionSet);
  return paths;
}

describe('static administrative MCP catalog', () => {
  it('classifies every resolver operation so new fields require deliberate review', () => {
    const catalog = new Set(ADMIN_MCP_OPERATIONS.map((entry) => entry.field));
    const root = resolve(process.cwd(), 'src/app');
    const inspectDirectory = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) {
          inspectDirectory(path);
        } else if (entry.name.endsWith('resolver.ts')) {
          const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
          for (const name of operationMethods(source).keys()) {
            expect({ field: name, reviewed: catalog.has(name) || Boolean(ADMIN_MCP_EXCLUSIONS[name]) }).toEqual({
              field: name,
              reviewed: true,
            });
          }
        }
      }
    };
    inspectDirectory(root);
  });

  it('contains unique real resolver operations and explicit authorization ownership', () => {
    expect(new Set(ADMIN_MCP_OPERATIONS.map((entry) => entry.field)).size).toBe(ADMIN_MCP_OPERATIONS.length);
    const sources = new Map<string, Map<string, ts.MethodDeclaration>>();
    for (const operation of ADMIN_MCP_OPERATIONS) {
      if (operation.transport === 'REST') {
        expect(REST_ADMIN_OPERATION_FIELDS).toContain(operation.field);
        expect(operation.source).toContain('controller.ts');
        expect(ADMIN_MCP_EXCLUSIONS[operation.field]).toBeUndefined();
        continue;
      }
      let methods = sources.get(operation.source);
      if (!methods) {
        methods = operationMethods(sourceFile(operation.source));
        sources.set(operation.source, methods);
      }
      const method = methods.get(operation.field);
      expect(method).toBeDefined();
      if (!method) continue;
      const decorators = [
        ...(ts.getDecorators(method) ?? []),
        ...(ts.isClassDeclaration(method.parent) ? (ts.getDecorators(method.parent) ?? []) : []),
      ];
      const protectedByGuard = decorators.some((decorator) => decorator.getText().startsWith('@RequirePermissions('));
      expect({ field: operation.field, protected: protectedByGuard || operation.serviceAuthorized }).toEqual({
        field: operation.field,
        protected: true,
      });
      expect(operation.description.length).toBeGreaterThan(20);
      expect(ADMIN_MCP_EXCLUSIONS[operation.field]).toBeUndefined();
    }
  });

  it('keeps projections explicit and excludes credentials and private storage fields', () => {
    const forbidden =
      /token|secret|password|storage|objectKey|accessCode|scannerCode|aztecCode|credential|presigned|downloadUrl|receiptUrl|previewUrl/i;
    const allowedJsonFields = new Set([
      'answersJson',
      'elementsJson',
      'overallScoringRulesJson',
      'bracketRulesJson',
      'rosterRulesJson',
      'scoreRulesJson',
      'settingsJson',
      'standingsRulesJson',
      'summaryJson',
      'timerRulesJson',
    ]);
    const explicitlyExcludedDataFields = /^(payloadJson|fieldRevisionsJson|metadataJson|beforeJson|afterJson)$/i;
    for (const operation of ADMIN_MCP_OPERATIONS) {
      expect(operation.field).not.toMatch(/^(public[A-Z]|currentUser|my[A-Z]|login|logout|refresh|totp)/);
      if (operation.transport === 'REST') continue;
      if (!operation.selection) continue;
      const document = parse(`query CatalogSelection { operation { ${operation.selection} } }`);
      visit(document, {
        Field(node) {
          expect(node.name.value).not.toMatch(forbidden);
          expect(node.name.value).not.toMatch(explicitlyExcludedDataFields);
          if (/json$/i.test(node.name.value)) expect(allowedJsonFields.has(node.name.value)).toBe(true);
          expect(node.arguments ?? []).toHaveLength(0);
        },
        FragmentSpread() {
          throw new Error('Catalog projections must be self-contained.');
        },
      });
      expect(document.definitions[0].kind).toBe(Kind.OPERATION_DEFINITION);
    }
    expect(ADMIN_MCP_OPERATIONS.find((entry) => entry.field === 'prizeDrawWinnerContact')?.personalData).toBe(true);
    expect(
      ADMIN_MCP_OPERATIONS.filter((entry) => entry.personalData).every((entry) => entry.risk === 'SENSITIVE'),
    ).toBe(true);
  });

  it('exposes complete safe projections for the reviewed administrative workflows', () => {
    const has = (field: string, ...paths: string[]) => {
      const selected = projectionPaths(field);
      for (const path of paths)
        expect({ field, path, selected: selected.has(path) }).toEqual({ field, path, selected: true });
    };
    const personal = (field: string) => {
      const operation = ADMIN_MCP_OPERATIONS.find((entry) => entry.field === field);
      expect(operation?.personalData).toBe(true);
      expect(operation?.risk).toBe('SENSITIVE');
    };

    for (const field of ['eventForms', 'eventForm', 'saveEventForm', 'publishEventForm']) {
      has(field, 'elementsJson', 'links.target.name', 'links.audiences', 'publicationState');
    }
    has('eventFormResults', 'summaryJson', 'form.elementsJson', 'responses.answersJson', 'responses.respondentEmail');
    personal('eventFormResults');

    has('publicationWorkspace', 'tree.children.children.id', 'items.id', 'warnings.type', 'warnings.description');
    personal('publicationWorkspace');

    has('adminReceiptValidationQueue', 'items.personName', 'items.receipt.id', 'items.events.name');
    expect(projectionPaths('adminReceiptValidationQueue').has('items.receipt.ocrText')).toBe(false);
    has('adminReceiptOcrText', 'text', 'totalLength', 'nextOffset');
    personal('adminReceiptOcrText');
    expect(projectionPaths('adminReceiptValidationQueue').has('items.receipt.imageUrl')).toBe(false);
    for (const field of ['adminReceiptValidationQueue', 'approveAdminReceipt', 'rejectAdminReceipt']) personal(field);

    has('contentReviews', 'groups.items.fields.before', 'groups.items.fields.after', 'groups.items.afterMaterial.url');
    personal('contentReviews');
    has('auditLogExplorer', 'entries.summary', 'entries.changedFields', 'entries.changes.beforeValue');
    for (const path of ['entries.beforeJson', 'entries.afterJson', 'entries.metadataJson']) {
      expect(projectionPaths('auditLogExplorer').has(path)).toBe(false);
    }
    personal('auditLogExplorer');

    has('permissionRoles', 'assignments.subjectName', 'assignments.scopes.scope', 'permissions');
    has('permissionGroups', 'members.person.email', 'assignedRoleIds');
    personal('permissionRoles');
    personal('permissionGroups');

    has('people', 'email', 'identityDocument', 'user.unespRole');
    has('person', 'secondaryEmails', 'user.role', 'lecturerProfile.biography');
    has('createPerson', 'lecturerProfile.whatsapp');
    has('updatePerson', 'lecturerProfile.linkedin');

    has(
      'adminSportsTournamentRead',
      'categories.timerRulesJson',
      'teams.id',
      'scoreEntries.points',
      'participants.person.name',
    );
    has(
      'adminSportsCategoryRead',
      'stages.settingsJson',
      'matches.scoreboard.homeScore',
      'standings.points',
      'placements.placement',
    );
    has('adminSportsTeamRead', 'members.person.name', 'representatives.person.name', 'changeRequests.status');
    has('adminSportsRegistrationRead', 'members.person.name', 'lineupMembers.person.name', 'rosters.entries.role');
    has('adminSportsMatchReviewRead', 'actions.reviewStatus', 'rosters.entries.status', 'officials.person.name');
    for (const field of [
      'adminSportsTournamentRead',
      'adminSportsCategoryRead',
      'adminSportsTeamRead',
      'adminSportsRegistrationRead',
      'adminSportsMatchReviewRead',
    ]) {
      personal(field);
    }
  });

  it('covers the sports administrative workflow through named tools', () => {
    const fields = new Set(ADMIN_MCP_OPERATIONS.map((entry) => entry.field));
    for (const field of [
      'adminSportsTournamentList',
      'adminSportsTournamentRead',
      'adminSportsCategoryRead',
      'adminSportsTeamRead',
      'adminSportsRegistrationRead',
      'adminSportsMatchReviewRead',
      'createSportsTournament',
      'updateSportsTournament',
      'createSportsCategory',
      'createSportsTeam',
      'createSportsTeamMember',
      'updateSportsTeamMember',
      'createSportsRegistration',
      'assignSportsTeamRepresentative',
      'revokeSportsTeamRepresentative',
      'createSportsVenue',
      'createSportsMatch',
      'assignSportsOfficial',
      'updateSportsOfficial',
      'commitAdminSportsMatchActions',
      'upsertAdminSportsMatchRoster',
      'reviewSportsMatchRoster',
      'generateSportsBracket',
      'generateNextSportsSwissRound',
      'reviewSportsTeamChange',
      'reviewSportsPlayerApplication',
      'reviewSportsMatchAction',
      'createSportsTournamentScoreEntry',
      'cloneSportsTournament',
      'cloneSportsCategory',
      'cloneSportsTeam',
      'deleteSportsTournament',
    ])
      expect(fields.has(field)).toBe(true);
    expect(ADMIN_MCP_OPERATIONS.filter((entry) => entry.domain === 'sports').length).toBeGreaterThanOrEqual(50);
  });

  it('represents bulk targets explicitly and never authorizes using a first item', () => {
    const actions = ADMIN_MCP_OPERATIONS.find((entry) => entry.field === 'commitAdminSportsMatchActions');
    expect(actions?.target).toEqual({
      mode: 'ARGUMENTS',
      paths: [{ argument: 'input.actions[].matchId', context: 'sportsMatchId' }],
    });
    for (const operation of ADMIN_MCP_OPERATIONS) {
      if (typeof operation.target === 'string') continue;
      if (operation.target.mode === 'ARGUMENTS') {
        expect(operation.target.paths.length).toBeGreaterThan(0);
        for (const path of operation.target.paths) expect(path.argument).not.toMatch(/\[0\]/);
      } else {
        expect(operation.target.reason.length).toBeGreaterThan(20);
      }
    }
  });

  it('records explicit exclusions for bearer credentials and unattributable jobs', () => {
    expect(ADMIN_MCP_EXCLUSIONS.createAdminOfflineAttendanceCollectorCredential).toContain('bearer');
    expect(ADMIN_MCP_EXCLUSIONS.createPublicationPreview).toContain('bearer');
    for (const field of [
      'requestCertificateIssuance',
      'restoreCertificate',
      'reissueAllCertificates',
      'scanMergeCandidates',
      'notifyEventParticipants',
      'dataTransferSchema',
      'exportDataTransfer',
      'previewDataTransfer',
      'dataTransferHistory',
      'applyDataTransfer',
      'undoDataTransfer',
    ]) {
      expect(ADMIN_MCP_OPERATIONS.some((entry) => entry.field === field)).toBe(true);
      expect(ADMIN_MCP_EXCLUSIONS[field]).toBeUndefined();
    }
    expect(new Set(REST_ADMIN_OPERATION_FIELDS)).toEqual(
      new Set(ADMIN_MCP_OPERATIONS.filter((entry) => entry.transport === 'REST').map((entry) => entry.field)),
    );
  });
});
