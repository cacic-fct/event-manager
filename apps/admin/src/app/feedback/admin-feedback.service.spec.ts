import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { AdminFeedbackService } from './admin-feedback.service';

describe('AdminFeedbackService', () => {
  it('queues distinct failures and deduplicates repeated messages', () => {
    const closed = new Subject<void>();
    const dialog = {
      open: vi.fn().mockReturnValue({ afterClosed: () => closed.asObservable() }),
    };
    TestBed.configureTestingModule({ providers: [{ provide: MatDialog, useValue: dialog }] });
    const service = TestBed.inject(AdminFeedbackService);

    service.showErrorMessage('Falha A');
    service.showErrorMessage('Falha A');
    service.showErrorMessage('Falha B');

    expect(dialog.open).toHaveBeenCalledTimes(1);
    closed.next();
    expect(dialog.open).toHaveBeenCalledTimes(2);
  });

  it('uses the operation fallback for unknown failures', () => {
    const dialog = {
      open: vi.fn().mockReturnValue({ afterClosed: () => new Subject<void>().asObservable() }),
    };
    TestBed.configureTestingModule({ providers: [{ provide: MatDialog, useValue: dialog }] });
    const service = TestBed.inject(AdminFeedbackService);

    service.error({}, 'Não foi possível salvar.');

    expect(dialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ data: expect.objectContaining({ message: 'Não foi possível salvar.' }) }),
    );
  });
});
