import { SportsMatchOverlayController } from './sports-match-overlay.controller';

describe('SportsMatchOverlayController', () => {
  const overlays = {
    render: jest.fn(),
    data: jest.fn(),
    stylesheet: jest.fn(),
    script: jest.fn(),
  };
  const response = {
    type: jest.fn(),
    send: jest.fn(),
  };
  let controller: SportsMatchOverlayController;

  beforeEach(() => {
    jest.clearAllMocks();
    response.type.mockReturnValue(response);
    response.send.mockReturnValue(response);
    controller = new SportsMatchOverlayController(overlays as never);
  });

  it('renders the OBS document with validated query options from the overlay service', async () => {
    const query = { team: 'home', score: '1', periodWord: 'Turno' };
    overlays.render.mockResolvedValue('<!doctype html>');

    await controller.render('match-1', query, response as never);

    expect(overlays.render).toHaveBeenCalledWith('match-1', query);
    expect(response.type).toHaveBeenCalledWith('html');
    expect(response.send).toHaveBeenCalledWith('<!doctype html>');
  });

  it('returns the minimal public overlay projection', async () => {
    const projection = { matchId: 'match-1', revision: 4 };
    overlays.data.mockResolvedValue(projection);

    await expect(controller.data('match-1')).resolves.toBe(projection);
    expect(overlays.data).toHaveBeenCalledWith('match-1');
  });

  it('serves same-origin stylesheet and runtime assets with explicit content types', () => {
    overlays.stylesheet.mockReturnValue('.overlay{}');
    overlays.script.mockReturnValue('window.startOverlay()');

    controller.stylesheet(response as never);
    expect(response.type).toHaveBeenCalledWith('text/css');
    expect(response.send).toHaveBeenCalledWith('.overlay{}');

    controller.script(response as never);
    expect(response.type).toHaveBeenCalledWith('application/javascript');
    expect(response.send).toHaveBeenCalledWith('window.startOverlay()');
  });
});
