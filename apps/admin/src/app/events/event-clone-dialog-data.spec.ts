import { createEventCloneDialogData } from './event-clone-dialog-data';

describe('createEventCloneDialogData', () => {
  it('retains every copy category while disabling only inaccessible categories', () => {
    const data = createEventCloneDialogData('Oficina', {
      canCopyLecturers: false,
      canCopyCertificateConfig: true,
      canCopyAttendances: false,
    });

    expect(data.defaultName).toBe('Oficina (cópia)');
    expect(data.parts.map((part) => part.key)).toEqual([
      'lecturers',
      'certificateConfig',
      'subscriptionSettings',
      'attendanceSettings',
      'attendances',
      'place',
      'visibility',
    ]);
    expect(data.parts[0]).toMatchObject({ disabled: true });
    expect(data.parts[1]).toMatchObject({ disabled: false });
    expect(data.parts[4]).toMatchObject({ disabled: true, defaultSelected: false });
  });
});
