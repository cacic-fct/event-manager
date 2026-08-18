import { parseLegacyEventDescriptionConversionOptions } from './convert-legacy-event-descriptions.command';

describe('parseLegacyEventDescriptionConversionOptions', () => {
  it('defaults to a dry run with bounded batches', () => {
    expect(parseLegacyEventDescriptionConversionOptions([])).toEqual({
      apply: false,
      batchSize: 100,
    });
  });

  it('accepts explicit apply mode and a custom batch size', () => {
    expect(
      parseLegacyEventDescriptionConversionOptions(['--apply', '--batch-size', '250']),
    ).toEqual({ apply: true, batchSize: 250 });
  });

  it.each([
    ['--batch-size'],
    ['--batch-size', '0'],
    ['--batch-size', '1001'],
    ['--batch-size', 'invalid'],
    ['--unexpected'],
  ])('rejects invalid arguments: %s', (...args) => {
    expect(() => parseLegacyEventDescriptionConversionOptions(args)).toThrow();
  });
});
