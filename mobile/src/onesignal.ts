import OneSignal from '@onesignal/capacitor-plugin';
import { installOneSignalDevice } from '@/lib/onesignal-client';
import { native } from './platform';

export function installMobileOneSignal() {
  if (!native) return;
  installOneSignalDevice({
    initialize: async appId => {
      // Register first so cold-start taps are available once initialization finishes.
      OneSignal.Notifications.addEventListener('click', event => {
        const recipientId = (event.notification.additionalData as { recipientId?: unknown } | undefined)?.recipientId;
        if (typeof recipientId === 'string' && recipientId.length <= 100) window.location.assign(`/?recipientId=${encodeURIComponent(recipientId)}`);
      });
      await OneSignal.initialize(appId);
    },
    login: externalId => OneSignal.login(externalId),
    enable: async () => {
      if (!await OneSignal.Notifications.requestPermission(false)) throw new Error('Allow notifications in your device settings, then try again.');
      await OneSignal.User.pushSubscription.optIn();
    },
    subscriptionId: async () => await OneSignal.User.pushSubscription.getOptedInAsync() ? OneSignal.User.pushSubscription.getIdAsync() : null,
    logout: async () => { await OneSignal.User.pushSubscription.optOut(); await OneSignal.logout(); },
  });
}
