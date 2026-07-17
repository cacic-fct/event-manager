import { createEventCloneDialogData } from './workspace-event-clone-dialog-data';

describe('createEventCloneDialogData', () => {
  it('retains every copy category while disabling only inaccessible categories', () => {
    const data = createEventCloneDialogData('Oficina', { canCopyLecturers: false, canCopyCertificateConfig: true });

    expect(data.defaultName).toBe('Oficina (cópia)');
    expect(data.parts.map((part) => part.key)).toEqual([
      'lecturers',
      'certificateConfig',
      'subscriptionSettings',
      'attendanceSettings',
      'place',
      'visibility',
    ]);
    expect(data.parts[0]).toMatchObject({ disabled: true });
    expect(data.parts[1]).toMatchObject({ disabled: false });
  });
});
