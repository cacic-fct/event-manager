import { EventAttendancesCoreSupport } from './core-support';
import { GraphqlContext } from './types';
import { parseStoredScannerUserId, scannerUserIdForStorage } from '../user-scanner-code';

class CoreSupportHarness extends EventAttendancesCoreSupport {
  constructor() {
    super({} as never, {} as never);
  }

  actorId(context: GraphqlContext) {
    return this.getActorId(context);
  }

  firstName(name: string) {
    return this.getFirstName(name);
  }

  userIdFromAztecCode(code: string) {
    return this.parseUserAztecCode(code);
  }
}

describe('EventAttendancesCoreSupport', () => {
  const support = new CoreSupportHarness();

  it('resolves actor ids from both GraphQL context request shapes', () => {
    expect(support.actorId({ req: { user: { sub: 'req-user' } } } as never)).toBe('req-user');
    expect(support.actorId({ request: { user: { sub: 'request-user' } } } as never)).toBe('request-user');
    expect(support.actorId({} as never)).toBeUndefined();
  });

  it('extracts first names while preserving blank names', () => {
    expect(support.firstName('  Ana Maria Silva  ')).toBe('Ana');
    expect(support.firstName('   ')).toBe('   ');
  });

  it('parses user Aztec codes through the shared scanner parser', () => {
    expect(support.userIdFromAztecCode('user:user-1')).toBe('user-1');
    expect(support.userIdFromAztecCode('invalid:user-1')).toBeNull();
  });

  it('normalizes scanner user ids for stored attendance codes', () => {
    expect(scannerUserIdForStorage(' user:user-1 ')).toBe('user-1');
    expect(scannerUserIdForStorage('   ')).toBeNull();
    expect(scannerUserIdForStorage(null)).toBeNull();
    expect(scannerUserIdForStorage(undefined)).toBeNull();

    expect(parseStoredScannerUserId(' user:user-2 ')).toBe('user-2');
    expect(parseStoredScannerUserId(' legacy-user-id ')).toBe('legacy-user-id');
    expect(parseStoredScannerUserId('invalid:user-2')).toBeNull();
    expect(parseStoredScannerUserId('   ')).toBeNull();
  });
});
