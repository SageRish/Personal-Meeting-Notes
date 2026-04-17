import type { MeetingPlatform } from '@meetings/core';

export type ConsentDecision = 'granted' | 'denied' | 'unset';

const keyFor = (platform: MeetingPlatform, meetingId?: string): string =>
  meetingId ? `meeting-consent:${platform}:${meetingId}` : `meeting-consent:${platform}`;

export const consentStore = {
  get(platform: MeetingPlatform, meetingId?: string): ConsentDecision {
    const scopedKey = keyFor(platform, meetingId);
    const fallbackKey = keyFor(platform);
    const value = window.localStorage.getItem(scopedKey) ?? (meetingId ? window.localStorage.getItem(fallbackKey) : null);
    if (value === 'granted' || value === 'denied') {
      return value;
    }

    return 'unset';
  },
  set(platform: MeetingPlatform, value: Exclude<ConsentDecision, 'unset'>, meetingId?: string): void {
    window.localStorage.setItem(keyFor(platform, meetingId), value);
  },
  clear(platform: MeetingPlatform, meetingId?: string): void {
    window.localStorage.removeItem(keyFor(platform, meetingId));
  },
};
