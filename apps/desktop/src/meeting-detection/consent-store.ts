import type { MeetingPlatform } from '@meetings/core';

export type ConsentDecision = 'granted' | 'denied' | 'unset';

const keyFor = (platform: MeetingPlatform): string => `meeting-consent:${platform}`;

export const consentStore = {
  get(platform: MeetingPlatform): ConsentDecision {
    const value = window.localStorage.getItem(keyFor(platform));
    if (value === 'granted' || value === 'denied') {
      return value;
    }

    return 'unset';
  },
  set(platform: MeetingPlatform, value: Exclude<ConsentDecision, 'unset'>): void {
    window.localStorage.setItem(keyFor(platform), value);
  },
  clear(platform: MeetingPlatform): void {
    window.localStorage.removeItem(keyFor(platform));
  },
};
