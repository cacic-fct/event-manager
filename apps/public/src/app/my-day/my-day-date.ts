import { addDays, differenceInMinutes, startOfDay } from 'date-fns';

const TIME_ZONE = 'America/Sao_Paulo';

export function myDayDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function myDayTomorrowKey(date = new Date()): string {
  return myDayDateKey(addDays(date, 1));
}

export function myDayCountdown(startDate: string, now: Date): string | null {
  const minutes = differenceInMinutes(new Date(startDate), now, { roundingMethod: 'ceil' });
  if (minutes <= 0) {
    return null;
  }
  if (minutes <= 10) {
    return 'começando em breve';
  }
  if (minutes < 60) {
    return `em ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `em ${hours} h` : `em ${hours} h ${remainingMinutes} min`;
}

export function myDayTimeProgress(startDate: string, now: Date): number {
  const eventStart = new Date(startDate);
  const midnight = startOfDay(eventStart);
  const duration = eventStart.getTime() - midnight.getTime();
  if (duration <= 0) {
    return now >= eventStart ? 100 : 0;
  }
  const elapsed = now.getTime() - midnight.getTime();
  return Math.max(0, Math.min(100, (elapsed / duration) * 100));
}
