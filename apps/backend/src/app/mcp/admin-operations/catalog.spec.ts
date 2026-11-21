import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Kind, parse, visit } from 'graphql';
import ts from 'typescript';
import { ADMIN_MCP_EXCLUSIONS, ADMIN_MCP_OPERATIONS } from './catalog';

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

  it('never selects credentials, private storage fields or nested collection relations', () => {
    const forbidden =
      /token|secret|password|storage|objectKey|accessCode|scannerCode|aztecCode|credential|presigned|downloadUrl|receiptUrl|previewUrl/i;
    for (const operation of ADMIN_MCP_OPERATIONS) {
      expect(operation.field).not.toMatch(/^(public[A-Z]|currentUser|my[A-Z]|login|logout|refresh|totp)/);
      if (!operation.selection) continue;
      const document = parse(`query CatalogSelection { operation { ${operation.selection} } }`);
      visit(document, {
        Field(node) {
          expect(node.name.value).not.toMatch(forbidden);
          expect(node.name.value).not.toMatch(/json$|payload|snapshot|fieldRevisions/i);
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
    expect(ADMIN_MCP_EXCLUSIONS.requestCertificateIssuance).toContain('audit context');
    expect(ADMIN_MCP_EXCLUSIONS.notifyEventParticipants).toContain('audit context');
  });
});
