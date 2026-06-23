import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CalendarResolver } from './calendar.resolver';

describe('CalendarResolver', () => {
  const context = {} as never;
  const authenticatedUser = { sub: 'keycloak|admin-user' };
  const user = { id: 'admin-user' };

  it('delegates personal admin feed settings for current non-super-admin event managers', async () => {
    const { authorizationPolicy, calendars, currentUserContext, resolver } = createResolver();
    authorizationPolicy.hasEventManagerAccess.mockReturnValue(true);
    authorizationPolicy.isSuperAdmin.mockReturnValue(false);
    currentUserContext.getAuthenticatedUser.mockReturnValue(authenticatedUser);
    currentUserContext.resolveCurrentUserContext.mockResolvedValue({ user });
    calendars.getCurrentUserAdminCalendarFeedSettings.mockResolvedValue({ enabled: true });

    await expect(resolver.currentUserAdminCalendarFeedSettings(context)).resolves.toEqual({ enabled: true });

    expect(calendars.getCurrentUserAdminCalendarFeedSettings).toHaveBeenCalledWith('admin-user');
  });

  it('rejects personal admin feed access without Event Manager access', async () => {
    const { authorizationPolicy, calendars, currentUserContext, resolver } = createResolver();
    authorizationPolicy.hasEventManagerAccess.mockReturnValue(false);
    currentUserContext.getAuthenticatedUser.mockReturnValue(authenticatedUser);

    await expect(resolver.currentUserAdminCalendarFeedSettings(context)).rejects.toBeInstanceOf(ForbiddenException);

    expect(currentUserContext.resolveCurrentUserContext).not.toHaveBeenCalled();
    expect(calendars.getCurrentUserAdminCalendarFeedSettings).not.toHaveBeenCalled();
  });

  it('rejects personal admin feed mutations for super-admin users', async () => {
    const { authorizationPolicy, calendars, currentUserContext, resolver } = createResolver();
    authorizationPolicy.hasEventManagerAccess.mockReturnValue(true);
    authorizationPolicy.isSuperAdmin.mockReturnValue(true);
    currentUserContext.getAuthenticatedUser.mockReturnValue(authenticatedUser);
    currentUserContext.resolveCurrentUserContext.mockResolvedValue({ user });

    await expect(resolver.setCurrentUserAdminCalendarFeedEnabled(true, context)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(calendars.setCurrentUserAdminCalendarFeedEnabled).not.toHaveBeenCalled();
  });

  it('delegates personal admin feed enablement and key rotation for regular admins', async () => {
    const { authorizationPolicy, calendars, currentUserContext, resolver } = createResolver();
    authorizationPolicy.hasEventManagerAccess.mockReturnValue(true);
    authorizationPolicy.isSuperAdmin.mockReturnValue(false);
    currentUserContext.getAuthenticatedUser.mockReturnValue(authenticatedUser);
    currentUserContext.resolveCurrentUserContext.mockResolvedValue({ user });
    calendars.setCurrentUserAdminCalendarFeedEnabled.mockResolvedValue({ enabled: true });
    calendars.rotateCurrentUserAdminCalendarFeedKey.mockResolvedValue({ enabled: false });

    await expect(resolver.setCurrentUserAdminCalendarFeedEnabled(true, context)).resolves.toEqual({ enabled: true });
    await expect(resolver.rotateCurrentUserAdminCalendarFeedKey(context)).resolves.toEqual({ enabled: false });

    expect(calendars.setCurrentUserAdminCalendarFeedEnabled).toHaveBeenCalledWith('admin-user', true);
    expect(calendars.rotateCurrentUserAdminCalendarFeedKey).toHaveBeenCalledWith('admin-user');
  });

  it('delegates shared super-admin feed settings and rotation', async () => {
    const { calendars, resolver } = createResolver();
    calendars.getSuperAdminCalendarFeedSettings.mockResolvedValue({ enabled: true });
    calendars.rotateSuperAdminCalendarFeedKey.mockResolvedValue({ enabled: true, rotatedAt: new Date() });

    await expect(resolver.superAdminCalendarFeedSettings()).resolves.toEqual({ enabled: true });
    await expect(resolver.rotateSuperAdminCalendarFeedKey()).resolves.toEqual({
      enabled: true,
      rotatedAt: expect.any(Date),
    });

    expect(calendars.getSuperAdminCalendarFeedSettings).toHaveBeenCalledTimes(1);
    expect(calendars.rotateSuperAdminCalendarFeedKey).toHaveBeenCalledTimes(1);
  });
});

function createResolver() {
  const currentUserContext = {
    getAuthenticatedUser: jest.fn(),
    resolveCurrentUserContext: jest.fn(),
  };
  const authorizationPolicy = {
    hasEventManagerAccess: jest.fn(),
    isSuperAdmin: jest.fn(),
  };
  const calendars = {
    getCurrentUserAdminCalendarFeedSettings: jest.fn(),
    setCurrentUserAdminCalendarFeedEnabled: jest.fn(),
    rotateCurrentUserAdminCalendarFeedKey: jest.fn(),
    getSuperAdminCalendarFeedSettings: jest.fn(),
    rotateSuperAdminCalendarFeedKey: jest.fn(),
  };

  return {
    authorizationPolicy,
    calendars,
    currentUserContext,
    resolver: new CalendarResolver(currentUserContext as never, authorizationPolicy as never, calendars as never),
  };
}
