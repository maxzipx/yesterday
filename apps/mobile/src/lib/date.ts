export function formatDateLabel(dateInput: string): string {
  const [year, month, day] = dateInput.split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    return dateInput;
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(utcDate);
}

export function isValidDateInput(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function timeStringToDate(time: string): Date {
  const [hours, minutes] = time.split(":").map((part) => Number(part));
  const base = new Date();
  base.setSeconds(0);
  base.setMilliseconds(0);
  if (Number.isFinite(hours) && Number.isFinite(minutes)) {
    base.setHours(hours, minutes, 0, 0);
  }
  return base;
}

export function dateToTimeString(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
