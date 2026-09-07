import { attendancePriceTierPolicyChanged, validateAttendancePriceTiers } from './attendance-price-tier-policy';

describe('attendance price tier policy', () => {
  const tx = { priceTier: { findMany: jest.fn() } };

  beforeEach(() => jest.clearAllMocks());

  it('refreshes on tier changes but not reordered selections', () => {
    expect(attendancePriceTierPolicyChanged(
      { regularAttendancePriceTierIds: ['b', 'a'] },
      { regularAttendancePriceTierIds: ['a', 'b'] },
    )).toBe(false);
    expect(attendancePriceTierPolicyChanged(
      { regularAttendancePriceTierIds: [] },
      { regularAttendancePriceTierIds: ['a'] },
    )).toBe(true);
  });

  it('keeps an empty selection unrestricted without querying tiers', async () => {
    await validateAttendancePriceTiers(tx as never, { regularAttendancePriceTierIds: [] });
    expect(tx.priceTier.findMany).not.toHaveBeenCalled();
  });

  it('rejects restricted standalone events', async () => {
    await expect(validateAttendancePriceTiers(tx as never, { regularAttendancePriceTierIds: ['tier'] }))
      .rejects.toThrow('Vincule o evento');
  });

  it('accepts only tiers belonging to the linked major event', async () => {
    tx.priceTier.findMany.mockResolvedValue([{ id: 'tier' }]);
    await validateAttendancePriceTiers(tx as never, {
      majorEventId: 'major', regularAttendancePriceTierIds: ['tier'],
    });
    expect(tx.priceTier.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['tier'] }, price: { majorEventId: 'major' } }, select: { id: true },
    });
  });

  it('rejects stale or foreign tiers when moving a restricted event', async () => {
    tx.priceTier.findMany.mockResolvedValue([]);
    await expect(validateAttendancePriceTiers(tx as never,
      { majorEventId: 'other' },
      { majorEventId: 'major', regularAttendancePriceTierIds: ['tier'] },
    )).rejects.toThrow('Selecione apenas');
  });

  it('allows explicitly clearing the restriction when unlinking a major event', async () => {
    await validateAttendancePriceTiers(tx as never,
      { majorEventId: null, regularAttendancePriceTierIds: [] },
      { majorEventId: 'major', regularAttendancePriceTierIds: ['tier'] },
    );
    expect(tx.priceTier.findMany).not.toHaveBeenCalled();
  });
});
