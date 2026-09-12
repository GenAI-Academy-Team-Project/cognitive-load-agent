'use client';

export interface OneSignalDevice {
  initialize(appId: string): Promise<void>;
  login(externalId: string): Promise<void>;
  enable(): Promise<void>;
  subscriptionId(): Promise<string | null>;
  logout(): Promise<void>;
}

type WebSDK = {
  init(options: Record<string, unknown>): Promise<void>;
  login(externalId: string): Promise<void>;
  logout(): Promise<void>;
  User: { PushSubscription: { id?: string; optedIn?: boolean; optIn(): Promise<void>; optOut(): Promise<void> } };
  Notifications: { requestPermission(): Promise<void> };
};
let nativeDevice: OneSignalDevice | undefined;
let device: OneSignalDevice | undefined;
let initialization: Promise<void> | undefined;
let initializedApp: string | undefined;
let boot: Promise<void> | undefined;
const marker = 'carestead-onesignal-app';
const deviceMarker = 'carestead-onesignal-subscription';

export function installOneSignalDevice(adapter: OneSignalDevice) { nativeDevice = adapter; }
export function nativeOneSignalAvailable() { return Boolean(nativeDevice); }

async function webSDK(): Promise<WebSDK> {
  const host = window as unknown as { OneSignalDeferred?: ((sdk: WebSDK) => void)[] };
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('OneSignal could not load. Check your connection and retry.')), 15000);
    host.OneSignalDeferred = host.OneSignalDeferred || [];
    host.OneSignalDeferred.push(sdk => { clearTimeout(timeout); resolve(sdk); });
    if (!document.getElementById('carestead-onesignal-sdk')) {
      const script = document.createElement('script');
      script.id = 'carestead-onesignal-sdk';
      script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      script.defer = true;
      script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('OneSignal could not load.')); };
      document.head.appendChild(script);
    }
  });
}

async function getDevice(appId: string) {
  if (initializedApp && initializedApp !== appId) throw new Error('The OneSignal app changed. Reload Carestead before registering again.');
  if (!initialization) {
    initializedApp = appId;
    initialization = (async () => {
      if (nativeDevice) device = nativeDevice;
      else {
        const sdk = await webSDK();
        device = {
          initialize: id => sdk.init({ appId: id, allowLocalhostAsSecureOrigin: location.hostname === 'localhost' || location.hostname === '127.0.0.1', serviceWorkerPath: 'onesignal/OneSignalSDKWorker.js', serviceWorkerParam: { scope: '/onesignal/' }, notifyButton: { enable: false }, welcomeNotification: { disable: true }, autoResubscribe: false }),
          login: id => sdk.login(id),
          enable: async () => { await sdk.Notifications.requestPermission(); await sdk.User.PushSubscription.optIn(); },
          subscriptionId: async () => sdk.User.PushSubscription.optedIn ? sdk.User.PushSubscription.id || null : null,
          logout: async () => { await sdk.User.PushSubscription.optOut(); await sdk.logout(); },
        };
      }
      await device.initialize(appId);
    })().catch(error => { initialization = undefined; throw error; });
  }
  await initialization;
  return device!;
}

async function identity(careRecipientId: string) {
  const response = await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'begin_onesignal_push', careRecipientId }) });
  const result = await response.json() as { appId: string; externalId: string; error?: string };
  if (!response.ok) throw new Error(result.error || 'OneSignal is unavailable.');
  return result;
}

let prepared: { careRecipientId: string; appId: string; sdk: OneSignalDevice } | undefined;

export async function prepareOneSignalPush(careRecipientId: string) {
  const config = await identity(careRecipientId);
  const sdk = await getDevice(config.appId);
  await sdk.login(config.externalId);
  prepared = { careRecipientId, appId: config.appId, sdk };
}

export async function enableOneSignalPush(careRecipientId: string) {
  if (!prepared || prepared.careRecipientId !== careRecipientId) throw new Error('Connect this device first.');
  const { sdk, appId } = prepared;
  // This is called directly by a second user gesture, after async SDK setup.
  await sdk.enable();
  // SDK registration is asynchronous. Bound the wait and allow a normal retry
  // without clearing storage or creating another installation identity.
  for (let attempt = 0; attempt < 30; attempt++) {
    const id = await sdk.subscriptionId();
    if (id && !id.startsWith('local-')) {
      localStorage.setItem(marker, appId);
      localStorage.setItem(deviceMarker, id);
      return id;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Registration is still pending. Allow notifications in device settings, then try Enable again.');
}

export async function resumeOneSignal(careRecipientId: string) {
  if (!localStorage.getItem(marker)) return;
  if (!boot) boot = (async () => {
    const config = await identity(careRecipientId);
    const sdk = await getDevice(config.appId);
    await sdk.login(config.externalId);
  })().finally(() => { boot = undefined; });
  await boot;
}

export async function signOutOneSignal(careRecipientId: string) {
  if (!localStorage.getItem(marker)) return;
  // Remove server routing first, even if the provider is paused or unreachable.
  const subscriptionId = localStorage.getItem(deviceMarker);
  if (subscriptionId) {
    const response = await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'disable_onesignal_device', careRecipientId, subscriptionId }) });
    if (!response.ok) throw new Error('Could not disconnect this notification device. Try signing out again.');
  }
  // Server routing is already removed. Provider downtime must not prevent logout.
  if (device) await Promise.race([device.logout().catch(() => {}), new Promise(resolve => setTimeout(resolve, 3000))]);
  localStorage.removeItem(deviceMarker);
  localStorage.removeItem(marker);
}
