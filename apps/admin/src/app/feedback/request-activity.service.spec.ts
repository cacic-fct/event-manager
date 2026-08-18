import { RequestActivityService } from './request-activity.service';

describe('RequestActivityService', () => {
  it('keeps loading visible until every overlapping request finishes', () => {
    const activity = new RequestActivityService();

    const finishFirst = activity.begin();
    const finishSecond = activity.begin();
    expect(activity.loading()).toBe(true);

    finishFirst();
    expect(activity.loading()).toBe(true);

    finishSecond();
    expect(activity.loading()).toBe(false);
  });

  it('ignores duplicate completion callbacks', () => {
    const activity = new RequestActivityService();
    const finish = activity.begin();

    finish();
    finish();

    expect(activity.loading()).toBe(false);
  });
});
