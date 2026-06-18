import { BadRequestException } from '@nestjs/common';
import { resolvePagination } from './pagination';

describe('resolvePagination', () => {
  it('defaults missing values', () => {
    expect(resolvePagination()).toEqual({ skip: 0, take: 50 });
  });

  it('normalizes negative values and caps take', () => {
    expect(resolvePagination(-1, 20_000)).toEqual({ skip: 0, take: 1000 });
  });

  it('rejects non-integer pagination values', () => {
    expect(() => resolvePagination(1.5, 50)).toThrow(BadRequestException);
    expect(() => resolvePagination(0, 50.5)).toThrow(BadRequestException);
  });

  it('rejects skip values that would create an unbounded search window', () => {
    expect(() => resolvePagination(10_001, 50)).toThrow(BadRequestException);
  });
});
