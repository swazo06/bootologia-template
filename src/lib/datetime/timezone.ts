/** Normalize any date/ISO input to a UTC Date instance. */
export function toUtcDate(input: string | Date): Date {
  if (input instanceof Date) {
    return new Date(input.getTime());
  }
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("INVALID_DATETIME");
  }
  return parsed;
}

/**
 * Format a UTC instant for display in a user timezone using Intl.
 * Default pattern: ISO-like local parts `YYYY-MM-DD HH:mm`.
 */
export function formatInTimeZone(
  date: Date | string,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const utc = toUtcDate(date);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...options,
  });
  const parts = formatter.formatToParts(utc);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}
