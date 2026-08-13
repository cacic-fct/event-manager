import { BadRequestException } from '@nestjs/common';
import { SportsLivestreamProvider, SportsPreset } from '@prisma/client';
import { sportsAdminAuditRecords, sportsTestDate } from '../testing/sports-backend.fixtures';
import { SportsAdminSupport } from './sports-admin-support';

class TestSportsAdminSupport extends SportsAdminSupport {
  roster(input: Record<string, unknown>) {
    return this.validateRosterLimits(input as never);
  }
  matchName(category: string, home?: string, away?: string) {
    return this.buildMatchName(category, home, away);
  }
  emoji(sport: SportsPreset) {
    return this.defaultSportEmoji(sport);
  }
  range(start: Date, end: Date, label = 'torneio') {
    return this.assertDateRange(start, end, label);
  }
  optionalRange(start: Date | null | undefined, end: Date | null | undefined) {
    return this.assertOptionalDateRange(start, end, 'inscrição');
  }
  text(value: string, minimum = 2, maximum = 10) {
    return this.requireText(value, 'Nome', minimum, maximum);
  }
  optional(value: string | null | undefined, maximum = 10) {
    return this.optionalText(value, 'Descrição', maximum);
  }
  livestream(provider: SportsLivestreamProvider | null | undefined, value: string | null | undefined) {
    return this.normalizeLivestreamUrl(provider, value);
  }
  youtube(provider: SportsLivestreamProvider | null | undefined, value: string | null | undefined) {
    return this.youtubeCodeForLivestream(provider, value);
  }
  date(value: Date | undefined) {
    return this.requireDate(value, 'a data');
  }
  actor(actor: Record<string, unknown>) {
    return this.requireActorId(actor as never);
  }
  revisions(value: unknown) {
    return this.readRevisionMap(value as never);
  }
  snapshots(records: ReturnType<typeof sportsAdminAuditRecords>) {
    return {
      tournament: this.tournamentAuditSnapshot(records.tournament as never),
      category: this.categoryAuditSnapshot(records.category as never),
      team: this.teamAuditSnapshot(records.team as never),
      registration: this.registrationAuditSnapshot(records.registration as never),
      official: this.officialAuditSnapshot(records.official as never),
      scoreEntry: this.scoreEntryAuditSnapshot(records.scoreEntry as never),
      match: this.matchAuditSnapshot(records.match),
    };
  }
}

describe('SportsAdminSupport', () => {
  const support = new TestSportsAdminSupport();
  const rosterInput = {
    minimumRosterSize: 1,
    maximumRosterSize: 10,
    maximumCaptains: 1,
    maximumCoaches: 2,
    maximumPeriods: 4,
    sport: SportsPreset.FUTSAL,
  };

  it('accepts coherent roster limits and a named custom sport', () => {
    expect(() => support.roster(rosterInput)).not.toThrow();
    expect(() => support.roster({ ...rosterInput, sport: SportsPreset.OTHER, customSportName: 'Peteca' })).not.toThrow();
  });

  it.each(['minimumRosterSize', 'maximumRosterSize', 'maximumCaptains', 'maximumCoaches', 'maximumPeriods'])(
    'rejects negative or fractional numeric roster limits',
    (field) => {
      expect(() => support.roster({ ...rosterInput, [field]: -1 })).toThrow(BadRequestException);
      expect(() => support.roster({ ...rosterInput, [field]: 1.5 })).toThrow(BadRequestException);
    },
  );

  it('rejects inverted roster limits and unnamed custom sports', () => {
    expect(() => support.roster({ ...rosterInput, minimumRosterSize: 11 })).toThrow(
      'O mínimo do elenco não pode superar o máximo.',
    );
    expect(() => support.roster({ ...rosterInput, sport: SportsPreset.OTHER, customSportName: ' ' })).toThrow(
      'Informe o nome do esporte personalizado.',
    );
  });

  it('builds stable match names and default sports emoji', () => {
    expect(support.matchName('Futsal', 'Azul', 'Verde')).toBe('Azul × Verde - Futsal');
    expect(support.matchName('Futsal')).toBe('A definir × A definir - Futsal');
    expect(support.emoji(SportsPreset.FUTSAL)).toEqual(expect.any(String));
  });

  it('validates required and optional date ranges using relative fixtures', () => {
    const start = sportsTestDate(60_000);
    const end = sportsTestDate(120_000);
    expect(() => support.range(start, end)).not.toThrow();
    expect(() => support.range(end, start)).toThrow('O fim do torneio precisa ser posterior ao início.');
    expect(() => support.optionalRange(null, null)).not.toThrow();
    expect(() => support.optionalRange(start, undefined)).toThrow('Informe o início e o fim de inscrição.');
    expect(() => support.optionalRange(start, end)).not.toThrow();
  });

  it('normalizes required and optional text', () => {
    expect(support.text(' Azul ')).toBe('Azul');
    expect(() => support.text('x')).toThrow('Nome deve ter entre 2 e 10 caracteres.');
    expect(() => support.text('x'.repeat(11))).toThrow('Nome deve ter entre 2 e 10 caracteres.');
    expect(support.optional(' ')).toBeNull();
    expect(support.optional(' Texto ')).toBe('Texto');
    expect(() => support.optional('x'.repeat(11))).toThrow('Descrição deve ter no máximo 10 caracteres.');
  });

  it('normalizes secure livestream URLs and enforces provider hosts', () => {
    expect(support.livestream(null, null)).toBeNull();
    expect(() => support.livestream(SportsLivestreamProvider.YOUTUBE, null)).toThrow(
      'Informe a URL da transmissão ao selecionar um provedor.',
    );
    expect(() => support.livestream(null, 'invalid')).toThrow('Informe uma URL de transmissão válida.');
    expect(() => support.livestream(null, 'http://example.com/live')).toThrow(
      'A transmissão deve utilizar uma URL HTTPS.',
    );
    expect(() => support.livestream(SportsLivestreamProvider.YOUTUBE, 'https://example.com/live')).toThrow(
      'Informe uma URL válida do YouTube.',
    );
    expect(() => support.livestream(SportsLivestreamProvider.TWITCH, 'https://example.com/live')).toThrow(
      'Informe uma URL válida da Twitch.',
    );
    expect(support.livestream(SportsLivestreamProvider.GENERAL, ' https://example.com/live ')).toBe(
      'https://example.com/live',
    );
  });

  it.each([
    ['https://youtu.be/video-1', 'video-1'],
    ['https://www.youtube.com/watch?v=video-2', 'video-2'],
    ['https://youtube.com/live/video-3', 'video-3'],
  ])('extracts supported YouTube video identifiers', (url, expected) => {
    expect(support.youtube(SportsLivestreamProvider.YOUTUBE, url)).toBe(expected);
  });

  it('returns no YouTube identifier for other providers or empty URLs', () => {
    expect(support.youtube(SportsLivestreamProvider.TWITCH, 'https://twitch.tv/channel')).toBeNull();
    expect(support.youtube(SportsLivestreamProvider.YOUTUBE, null)).toBeNull();
  });

  it('requires dates and authenticated actor identifiers', () => {
    const date = sportsTestDate();
    expect(support.date(date)).toBe(date);
    expect(() => support.date(undefined)).toThrow('Informe a data.');
    expect(support.actor({ sub: 'admin-1' })).toBe('admin-1');
    expect(() => support.actor({})).toThrow('O usuário autenticado não possui identificador.');
  });

  it('keeps only integer field revisions from JSON data', () => {
    expect(support.revisions(null)).toEqual({});
    expect(support.revisions([])).toEqual({});
    expect(support.revisions({ name: 2, logo: 1.5, status: '3' })).toEqual({ name: 2 });
  });

  it('creates stable audit snapshots for every administrator-owned sports entity', () => {
    const records = sportsAdminAuditRecords();

    expect(support.snapshots(records)).toEqual(records);
  });
});
