import { EventFormTargetType } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { firstValueFrom, of } from 'rxjs';
import { PassThrough, Readable } from 'node:stream';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';
import { EventFormsController } from './event-forms.controller';

describe('EventFormsController', () => {
  const forms = {
    watchResults: jest.fn(),
    assertCurrentUserLiveResultsAccess: jest.fn(),
    watchCurrentUserResults: jest.fn(),
    streamAdminResultsCsv: jest.fn(),
  };
  const replay = {
    scope: jest.fn(),
    replay: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    replay.scope.mockReturnValue('form-scope');
    replay.replay.mockImplementation((_scope, _cursor, source) => source);
    forms.assertCurrentUserLiveResultsAccess.mockResolvedValue(undefined);
  });

  it('protects admin result streaming and export with distinct permissions', () => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, EventFormsController.prototype.streamResults)).toEqual([
      Permission.EventForm.Results,
    ]);
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, EventFormsController.prototype.exportResultsCsv)).toEqual([
      Permission.EventForm.Export,
    ]);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, EventFormsController.prototype.streamCurrentUserResults),
    ).toBeUndefined();
  });

  it('replays administrator result deltas from the provided cursor', async () => {
    const message = { data: { formId: 'form-1' } };
    forms.watchResults.mockReturnValueOnce(of(message));

    await expect(firstValueFrom(controller().streamResults('form-1', 'cursor-2'))).resolves.toEqual(message);
    expect(replay.scope).toHaveBeenCalledWith('event-form-results', 'form-1');
    expect(replay.replay).toHaveBeenCalledWith('form-scope', 'cursor-2', expect.anything());
    expect(forms.watchResults).toHaveBeenCalledWith('form-1');
  });

  it('authorizes current-user live results before constructing the scoped stream', async () => {
    const request = { user: { sub: 'user-1' } };
    const input = {
      formId: 'form-1',
      targetType: EventFormTargetType.EVENT,
      eventId: 'event-1',
      majorEventId: undefined,
    };
    const message = { data: { formId: 'form-1', updatedAt: publicFixtureDateFromNow() } };
    forms.watchCurrentUserResults.mockReturnValueOnce(of(message));

    await expect(
      firstValueFrom(
        controller().streamCurrentUserResults(
          'form-1',
          EventFormTargetType.EVENT,
          'event-1',
          undefined,
          request as never,
          'cursor-3',
        ),
      ),
    ).resolves.toEqual(message);

    expect(forms.assertCurrentUserLiveResultsAccess).toHaveBeenCalledWith({ req: request }, input);
    expect(forms.watchCurrentUserResults).toHaveBeenCalledWith({ req: request }, input);
    expect(replay.replay).toHaveBeenCalledWith('form-scope', 'cursor-3', expect.anything());
  });

  it('does not subscribe to current-user results when access is rejected', async () => {
    forms.assertCurrentUserLiveResultsAccess.mockRejectedValueOnce(new Error('Resultados indisponíveis.'));

    await expect(
      firstValueFrom(
        controller().streamCurrentUserResults(
          'form-1',
          EventFormTargetType.MAJOR_EVENT,
          undefined,
          'major-1',
          { user: { sub: 'user-1' } } as never,
          undefined,
        ),
      ),
    ).rejects.toThrow('Resultados indisponíveis.');
    expect(forms.watchCurrentUserResults).not.toHaveBeenCalled();
    expect(replay.replay).not.toHaveBeenCalled();
  });

  it('exports CSV with private download headers and the authenticated actor', async () => {
    const user = { sub: 'admin-1' };
    const response = Object.assign(new PassThrough(), { setHeader: jest.fn() });
    const stream = Readable.from(['Resposta\r\n']);
    forms.streamAdminResultsCsv.mockResolvedValueOnce(stream);

    await controller().exportResultsCsv('form-1', { user } as never, response as never);

    expect(forms.streamAdminResultsCsv).toHaveBeenCalledWith(user, 'form-1');
    expect(response.setHeader).toHaveBeenNthCalledWith(1, 'Content-Type', 'text/csv; charset=utf-8');
    expect(response.setHeader).toHaveBeenNthCalledWith(
      2,
      'Content-Disposition',
      'attachment; filename="form-results-form-1.csv"',
    );
    expect(response.read()?.toString()).toBe('Resposta\r\n');
  });

  it('propagates a CSV generator failure through the request promise', async () => {
    const response = Object.assign(new PassThrough(), { setHeader: jest.fn() });
    const stream = Readable.from(
      (async function* rows() {
        yield 'Resposta\r\n';
        throw new Error('database unavailable');
      })(),
    );
    forms.streamAdminResultsCsv.mockResolvedValueOnce(stream);

    await expect(
      controller().exportResultsCsv('form-1', { user: { sub: 'admin-1' } } as never, response as never),
    ).rejects.toThrow('database unavailable');
  });

  function controller(): EventFormsController {
    return new EventFormsController(forms as never, replay as never);
  }
});
