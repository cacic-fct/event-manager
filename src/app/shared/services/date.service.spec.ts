import { DateService } from 'src/app/shared/services/date.service';

describe('DateService', () => {
  let service: DateService;
  beforeEach(() => {
    service = new DateService();
  });

  it('#isInThePast should return true for past date', () => {
    expect(service.isInThePast(new Date('1970-01-01'))).toBe(true);
  });
});
