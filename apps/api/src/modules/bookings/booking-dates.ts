export function getPeruDateOnly(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((value) => value.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function dateOnlyToUtcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function bookingDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}
