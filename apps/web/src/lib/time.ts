const clock = new Intl.DateTimeFormat("fr-TN", {
  timeZone: "Africa/Tunis",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  numberingSystem: "latn",
});

export function tunisTime(iso: string): string {
  return clock.format(new Date(iso));
}

export function minutesSince(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}
