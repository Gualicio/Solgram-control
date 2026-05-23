/** Mock de firebase/app para DEMO MODE. */

const APP = { name: "[DEFAULT]", options: {}, automaticDataCollectionEnabled: false };

export function initializeApp(_config?: any, _name?: string) {
  return APP;
}
export function getApp(_name?: string) {
  return APP;
}
export function getApps() {
  return [APP];
}
export function deleteApp(_app: any) {
  return Promise.resolve();
}
export const SDK_VERSION = "demo";
