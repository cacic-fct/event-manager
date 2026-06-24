import { CalendarController } from './calendar.controller';

describe('CalendarController', () => {
  const originalPublicAppOrigin = process.env.PUBLIC_APP_ORIGIN;

  afterEach(() => {
    if (originalPublicAppOrigin === undefined) {
      delete process.env.PUBLIC_APP_ORIGIN;
    } else {
      process.env.PUBLIC_APP_ORIGIN = originalPublicAppOrigin;
    }
  });

  it('downloads public event calendars with the configured public origin and public cache headers', async () => {
    process.env.PUBLIC_APP_ORIGIN = 'https://eventos.cacic.dev.br/app';
    const calendars = {
      buildPublicEventCalendar: jest.fn().mockResolvedValue({
        content: 'BEGIN:VCALENDAR',
        fileName: 'oficina.ics',
      }),
    };
    const controller = new CalendarController(calendars as never);
    const response = createResponse();

    await controller.downloadPublicEventCalendar(
      'event-1',
      createRequest({
        protocol: 'http',
        host: 'internal.local',
        headers: {
          'x-forwarded-proto': 'https, http',
          'x-forwarded-host': 'eventos.cacic.dev.br, internal.local',
        },
      }),
      response as never,
    );

    expect(calendars.buildPublicEventCalendar).toHaveBeenCalledWith('event-1', 'https://eventos.cacic.dev.br');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/calendar; charset=utf-8');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="oficina.ics"');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=3600');
    expect(response.send).toHaveBeenCalledWith('BEGIN:VCALENDAR');
  });

  it('ignores forged forwarded origin headers when no public origin is configured', async () => {
    delete process.env.PUBLIC_APP_ORIGIN;
    const calendars = {
      buildPublicEventCalendar: jest.fn().mockResolvedValue({
        content: 'BEGIN:VCALENDAR',
        fileName: 'oficina.ics',
      }),
    };
    const controller = new CalendarController(calendars as never);
    const response = createResponse();

    await controller.downloadPublicEventCalendar(
      'event-1',
      createRequest({
        protocol: 'http',
        host: 'internal.local',
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'evil.example',
        },
      }),
      response as never,
    );

    expect(calendars.buildPublicEventCalendar).toHaveBeenCalledWith('event-1', 'http://internal.local');
  });

  it('downloads private user feeds with private cache headers', async () => {
    const calendars = {
      buildPrivateUserCalendarFeed: jest.fn().mockResolvedValue({
        content: 'PRIVATE:VCALENDAR',
        fileName: 'calendario-cacic-eventos.ics',
      }),
    };
    const controller = new CalendarController(calendars as never);
    const response = createResponse();

    await controller.downloadPrivateUserCalendarFeed(
      'private-key',
      createRequest({ protocol: 'https', host: 'eventos.cacic.dev.br' }),
      response as never,
    );

    expect(calendars.buildPrivateUserCalendarFeed).toHaveBeenCalledWith(
      'private-key',
      'https://eventos.cacic.dev.br',
    );
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, max-age=900');
  });

  it('downloads private admin feeds with private cache headers', async () => {
    const calendars = {
      buildPrivateAdminCalendarFeed: jest.fn().mockResolvedValue({
        content: 'ADMIN:VCALENDAR',
        fileName: 'calendario-admin-cacic-eventos.ics',
      }),
    };
    const controller = new CalendarController(calendars as never);
    const response = createResponse();

    await controller.downloadPrivateAdminCalendarFeed(
      'admin-key',
      createRequest({ protocol: 'https', host: 'eventos.cacic.dev.br' }),
      response as never,
    );

    expect(calendars.buildPrivateAdminCalendarFeed).toHaveBeenCalledWith('admin-key', 'https://eventos.cacic.dev.br');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="calendario-admin-cacic-eventos.ics"',
    );
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, max-age=900');
    expect(response.send).toHaveBeenCalledWith('ADMIN:VCALENDAR');
  });

  it('downloads shared super-admin feeds with private cache headers', async () => {
    const calendars = {
      buildSuperAdminCalendarFeed: jest.fn().mockResolvedValue({
        content: 'SUPER:VCALENDAR',
        fileName: 'calendario-super-admin-cacic-eventos.ics',
      }),
    };
    const controller = new CalendarController(calendars as never);
    const response = createResponse();

    await controller.downloadSuperAdminCalendarFeed(
      'super-key',
      createRequest({ protocol: 'https', host: 'eventos.cacic.dev.br' }),
      response as never,
    );

    expect(calendars.buildSuperAdminCalendarFeed).toHaveBeenCalledWith('super-key', 'https://eventos.cacic.dev.br');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="calendario-super-admin-cacic-eventos.ics"',
    );
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, max-age=900');
    expect(response.send).toHaveBeenCalledWith('SUPER:VCALENDAR');
  });
});

function createRequest(input: { protocol: string; host: string; headers?: Record<string, string> }) {
  return {
    protocol: input.protocol,
    headers: input.headers ?? {},
    get: jest.fn((header: string) => (header.toLowerCase() === 'host' ? input.host : undefined)),
  } as never;
}

function createResponse() {
  return {
    setHeader: jest.fn(),
    send: jest.fn(),
  };
}
