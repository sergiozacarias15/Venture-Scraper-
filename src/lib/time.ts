export type ZonedParts = { hour: number; minute: number; weekday: number };

/** Local hour/minute and ISO weekday (1=Mon..7=Sun) of `date` in an IANA timezone. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return {
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: weekdays.indexOf(parts.weekday) + 1,
  };
}

export function addMinutes(d: Date, m: number) {
  return new Date(d.getTime() + m * 60_000);
}
export function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 86_400_000);
}
export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
