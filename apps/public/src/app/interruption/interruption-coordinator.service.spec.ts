import type { Interruption } from './interruption-flow';
import { selectNextInterruption } from './interruption-coordinator.service';

const attendance = interruption('online-attendance', 'NORMAL', 100);
const requiredForm = interruption('required-subscription-form', 'NORMAL', 200);
const urgent = interruption('urgent-security-action', 'URGENT', 500);

describe('selectNextInterruption', () => {
  it('keeps online attendance ahead of required subscription forms', () => {
    expect(selectNextInterruption([requiredForm, attendance], { currentUrl: '/menu' })).toBe(attendance);
  });

  it('keeps urgent flows ahead of every normal flow', () => {
    expect(selectNextInterruption([attendance, urgent, requiredForm], { currentUrl: '/menu' })).toBe(urgent);
  });

  it('does not interrupt form completion or scanner collection with normal flows', () => {
    expect(selectNextInterruption([attendance, requiredForm], { currentUrl: '/profile/forms/form-1' })).toBeNull();
    expect(selectNextInterruption([attendance, requiredForm], { currentUrl: '/attendance/collect/event-1' })).toBeNull();
  });

  it('still permits urgent interruptions on protected normal-flow pages', () => {
    expect(selectNextInterruption([urgent, attendance], { currentUrl: '/profile/forms/form-1' })).toBe(urgent);
  });
});

function interruption(id: string, priority: Interruption['priority'], priorityOrder: number): Interruption {
  return {
    id,
    priority,
    priorityOrder,
    target: {} as Interruption['target'],
  };
}
