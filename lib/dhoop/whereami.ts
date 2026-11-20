/**
 * When a device will not say where it is: which of the few reasons it was, and what the person
 * can do about it on the device in their hand.
 *
 * A browser gives one of three answers when it refuses: the person (or the phone's settings)
 * said no, it could not work out a position, or it took too long. Dhoop used to answer all
 * three with "this device did not share its location", which sent a person on an iPhone
 * looking for a fault that was a switch in Settings. On an iPhone each browser has its own
 * switch under Location Services, and until it is on, a page is refused without the person
 * ever being asked.
 *
 * Safe to import from a screen: plain words.
 */

export type LocationFault = 'refused' | 'unavailable' | 'slow' | 'unsupported' | 'insecure';

/** The browser's own error number as one of Dhoop's reasons: 1 refused, 2 no position, 3 too slow. */
export function faultOf(code: number | undefined): LocationFault {
  return code === 1 ? 'refused' : code === 3 ? 'slow' : 'unavailable';
}

/** What is in the person's hand, as far as the steps to switch location on differ. */
export function deviceKind(userAgent: string): 'iphone' | 'android' | 'computer' {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iphone';
  if (/Android/i.test(userAgent)) return 'android';
  return 'computer';
}

/** The name an iPhone lists the browser under in Settings, Location Services. */
export function iphoneBrowser(userAgent: string): string {
  if (/CriOS/i.test(userAgent)) return 'Chrome';
  if (/FxiOS/i.test(userAgent)) return 'Firefox';
  if (/EdgiOS/i.test(userAgent)) return 'Edge';
  return 'Safari Websites';
}

const OTHERWISE = 'Or search for your address above and tap your building.';

/** What to tell the person, in one short paragraph: what went wrong and the way round it. */
export function locationHelp(fault: LocationFault, userAgent: string): string {
  const device = deviceKind(userAgent);
  if (fault === 'unsupported') return `This browser cannot share a location. ${OTHERWISE.replace(/^Or s/, 'S')}`;
  if (fault === 'insecure') return `A browser shares its location only with a secure page, one whose address starts with https. Open Dhoop at its https address. ${OTHERWISE}`;
  if (fault === 'refused') {
    if (device === 'iphone') {
      const browser = iphoneBrowser(userAgent);
      return `Location is switched off for ${browser} on this iPhone. Open the Settings app, then Privacy & Security, then Location Services, then ${browser}, and choose "While Using the App". Come back, reload this page, and choose Allow when asked. ${OTHERWISE}`;
    }
    if (device === 'android') return `Location is blocked for this site. Tap the icon at the left of the address bar, then Permissions, then Location, and allow it. Check that Location is on in the phone's quick settings too, then press Find my building again. ${OTHERWISE}`;
    return `Location is blocked for this site. Click the icon at the left of the address bar, allow Location, and press Find my building again. ${OTHERWISE}`;
  }
  return `This ${device === 'computer' ? 'computer' : 'phone'} could not work out where it is just now. ${device === 'computer' ? 'Check that its Wi-Fi is on, and try again.' : 'Step outside or near a window, and try again.'} ${OTHERWISE}`;
}
