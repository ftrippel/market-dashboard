import type { Time } from 'lightweight-charts';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatChartDate(time: Time): string {
  let year: number;
  let month: number;
  let day: number;
  let date: string;

  if (typeof time === 'number') {
    const value = new Date(time * 1000);
    year = value.getUTCFullYear();
    month = value.getUTCMonth() + 1;
    day = value.getUTCDate();
    date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  } else if (typeof time === 'string') {
    const match = ISO_DATE_PATTERN.exec(time);
    if (!match) return time;

    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
    date = time;
  } else {
    year = time.year;
    month = time.month;
    day = time.day;
    date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday} ${date}`;
}
