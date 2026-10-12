import type { Driver } from './driver';

// Holds the single open database. The real driver (which pulls in Capacitor) is loaded lazily,
// so tests can inject their own driver with setDriver() without touching any native code.
let driver: Driver | null = null;
let opening: Promise<Driver> | null = null;

export function setDriver(d: Driver | null) {
  driver = d;
  opening = null;
}

export async function getDriver(): Promise<Driver> {
  if (driver) return driver;
  opening ??= import('./driver').then((m) => m.createDriver());
  driver = await opening;
  return driver;
}
