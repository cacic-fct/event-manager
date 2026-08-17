const PUBLIC_TIME_ZONE = 'America/Sao_Paulo';

type CalendarParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: PUBLIC_TIME_ZONE,
  calendar: 'gregory',
  numberingSystem: 'latn',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function publicLocalDateKey(date: Date): string {
  const { year, month, day } = calendarParts(date);
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

export function publicLocalDayBounds(date: Date): { start: Date; end: Date } {
  const localDate = calendarParts(date);
  const start = startOfCalendarDate(localDate);
  const nextCalendarDate = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day + 1));
  const nextStart = startOfCalendarDate({
    year: nextCalendarDate.getUTCFullYear(),
    month: nextCalendarDate.getUTCMonth() + 1,
    day: nextCalendarDate.getUTCDate(),
  });

  return { start, end: new Date(nextStart.getTime() - 1) };
}

function calendarParts(date: Date): CalendarParts {
  const parts: Record<string, string> = Object.fromEntries(
    dateTimeFormatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return {
    year: Number(parts['year']),
    month: Number(parts['month']),
    day: Number(parts['day']),
    hour: Number(parts['hour']),
    minute: Number(parts['minute']),
    second: Number(parts['second']),
  };
}

function startOfCalendarDate(date: Pick<CalendarParts, 'year' | 'month' | 'day'>): Date {
  const utcMidnight = Date.UTC(date.year, date.month - 1, date.day);
  const firstOffset = timeZoneOffset(new Date(utcMidnight));
  const firstGuess = utcMidnight - firstOffset;
  const actualOffset = timeZoneOffset(new Date(firstGuess));
  return new Date(utcMidnight - actualOffset);
}

function timeZoneOffset(date: Date): number {
  const parts = calendarParts(date);
  const wholeSecond = date.getTime() - date.getMilliseconds();
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - wholeSecond;
}
