const MESSAGE_TIME_ZONE = "America/Lima";

function validDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatMessageTimestamp(value: string) {
  const date = validDate(value);
  if (!date) return value || "—";
  return date.toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: MESSAGE_TIME_ZONE,
  });
}

function localDayKey(value: string) {
  const date = validDate(value);
  if (!date) return value.slice(0, 10);

  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: MESSAGE_TIME_ZONE,
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
}

export function shouldShowMessageDayLabel(
  previousCreatedAt: string | null | undefined,
  currentCreatedAt: string,
) {
  return (
    !previousCreatedAt ||
    localDayKey(previousCreatedAt) !== localDayKey(currentCreatedAt)
  );
}

export function isSameMessageGroup(
  previousMessage:
    { senderId: string; createdAtIso: string } | null | undefined,
  currentMessage: { senderId: string; createdAtIso: string },
  maxGapMs = 5 * 60 * 1000,
) {
  if (
    !previousMessage ||
    previousMessage.senderId !== currentMessage.senderId ||
    shouldShowMessageDayLabel(
      previousMessage.createdAtIso,
      currentMessage.createdAtIso,
    )
  ) {
    return false;
  }

  const previousTime = validDate(previousMessage.createdAtIso)?.getTime();
  const currentTime = validDate(currentMessage.createdAtIso)?.getTime();
  if (previousTime == null || currentTime == null) return false;

  const gap = currentTime - previousTime;
  return gap >= 0 && gap <= maxGapMs;
}

export function formatMessageDayLabel(value: string, now: Date = new Date()) {
  const date = validDate(value);
  if (!date) return value || "Fecha no disponible";

  const today = now.toISOString();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const key = localDayKey(value);

  if (key === localDayKey(today)) return "Hoy";
  if (key === localDayKey(yesterday)) return "Ayer";

  return new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: MESSAGE_TIME_ZONE,
  }).format(date);
}

export function formatConversationListTime(
  value: string,
  now: Date = new Date(),
) {
  const date = validDate(value);
  if (!date) return "—";

  const key = localDayKey(value);
  if (key === localDayKey(now.toISOString())) {
    return new Intl.DateTimeFormat("es-PE", {
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      timeZone: MESSAGE_TIME_ZONE,
    }).format(date);
  }

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  if (key === localDayKey(yesterday)) return "Ayer";

  const currentYear = localDayKey(now.toISOString()).slice(0, 4);
  const sameYear = key.slice(0, 4) === currentYear;
  return new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: MESSAGE_TIME_ZONE,
  }).format(date);
}
