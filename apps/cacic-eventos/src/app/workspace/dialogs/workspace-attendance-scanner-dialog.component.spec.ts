import { WorkspaceAttendanceScannerDialogComponent } from './workspace-attendance-scanner-dialog.component';

describe('WorkspaceAttendanceScannerDialogComponent labels', () => {
  it('labels standalone subscribers with confirmed status', () => {
    const component = Object.create(WorkspaceAttendanceScannerDialogComponent.prototype) as {
      statusLabel: (status: string | null | undefined) => string;
    };

    expect(component.statusLabel('CONFIRMED')).toBe('Inscrição confirmada');
  });

  it('labels standalone attendees without a subscription as not subscribed', () => {
    const component = Object.create(WorkspaceAttendanceScannerDialogComponent.prototype) as {
      statusLabel: (status: string | null | undefined) => string;
    };

    expect(component.statusLabel(null)).toBe('Não inscrito');
    expect(component.statusLabel(undefined)).toBe('Não inscrito');
  });
});
