/** Mock de firebase/analytics para DEMO MODE.  Nada de telemetría. */

export function getAnalytics(_app?: any) {
  return null as any;
}
export function isSupported() {
  return Promise.resolve(false);
}
export function logEvent(_a?: any, _b?: any, _c?: any) {}
export function setUserId(_a?: any, _b?: any) {}
export function setUserProperties(_a?: any, _b?: any) {}
