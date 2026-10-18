// Server-time offset handling per the API contract: offset = X-Server-Time - Date.now()
let offsetMs = 0;

export function setServerOffset(serverTimeIso: string) {
  offsetMs = new Date(serverTimeIso).getTime() - Date.now();
}

export function serverNow(): number {
  return Date.now() + offsetMs;
}

export function secondsLeft(ackDeadlineIso: string): number {
  return Math.max(0, Math.round((new Date(ackDeadlineIso).getTime() - serverNow()) / 1000));
}

export function msLeft(ackDeadlineIso: string): number {
  return Math.max(0, new Date(ackDeadlineIso).getTime() - serverNow());
}
