import { BadRequestException } from '@nestjs/common';
import { OnlineAttendanceNotificationJobsProcessor } from './online-attendance-notification-jobs.processor';
import { ONLINE_ATTENDANCE_AVAILABLE_NOTIFICATION_JOB } from './online-attendance-notification-jobs.service';

describe('OnlineAttendanceNotificationJobsProcessor', () => {
  it('delivers the supported attendance notification payload', async () => {
    const deliver = jest.fn().mockResolvedValue(undefined);
    const processor = new OnlineAttendanceNotificationJobsProcessor({ deliver } as never);
    const data = { eventId: 'event-1', personId: 'person-1' };

    await processor.process({ name: ONLINE_ATTENDANCE_AVAILABLE_NOTIFICATION_JOB, data } as never);

    expect(deliver).toHaveBeenCalledWith(data);
  });

  it('rejects unsupported jobs without calling the delivery service', async () => {
    const deliver = jest.fn();
    const processor = new OnlineAttendanceNotificationJobsProcessor({ deliver } as never);

    await expect(processor.process({ name: 'unknown', data: {} } as never)).rejects.toThrow(BadRequestException);
    expect(deliver).not.toHaveBeenCalled();
  });
});
