import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { LocationCoordinatePickerDialogComponent } from './location-coordinate-picker-dialog.component';

describe('LocationCoordinatePickerDialogComponent', () => {
  const dialogRef = { close: vi.fn() };

  beforeEach(() => {
    dialogRef.close.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideNoopAnimations(),
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: MAT_DIALOG_DATA, useValue: { coordinates: null } },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('does not persist anything until a selected point is confirmed', () => {
    const component = TestBed.createComponent(LocationCoordinatePickerDialogComponent).componentInstance;

    component.confirm();
    expect(dialogRef.close).not.toHaveBeenCalled();

    component.cancel();
    expect(dialogRef.close).toHaveBeenCalledWith();
  });

  it('searches Nominatim in Brazilian Portuguese and confirms the returned coordinates', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '-20.761620', lon: '-41.533160' }],
    });
    vi.stubGlobal('fetch', fetchMock);
    const component = TestBed.createComponent(LocationCoordinatePickerDialogComponent).componentInstance;
    component.searchControl.setValue('  Praça Jerônimo Monteiro  ');

    await component.search();
    component.confirm();

    expect(fetchMock).toHaveBeenCalledOnce();
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('q=Pra%C3%A7a+Jer%C3%B4nimo+Monteiro');
    expect(url).toContain('accept-language=pt-BR');
    expect(dialogRef.close).toHaveBeenCalledWith({ latitude: -20.76162, longitude: -41.53316 });
  });

  it.each([
    [{ ok: true, json: async () => [] }, 'Nenhum endereço foi encontrado. Tente uma busca mais específica.'],
    [{ ok: false }, 'Não foi possível buscar o endereço agora. Tente novamente.'],
  ])('shows a useful error and never replaces the selection for an unsuccessful search', async (response, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const component = TestBed.createComponent(LocationCoordinatePickerDialogComponent).componentInstance;
    component.searchControl.setValue('Endereço inexistente');

    await component.search();

    expect(component.searchError()).toBe(message);
    expect(component.selectedCoordinates()).toBeNull();
    expect(component.searching()).toBe(false);
  });
});
