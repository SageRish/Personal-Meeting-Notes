import type { MeetingPlatform } from '@meetings/core';

export interface InProgressSessionMetadata {
  meetingId: string;
  platform: MeetingPlatform;
  startedAt: string;
  captureConfirmed: boolean;
}

const SESSION_KEY = 'meeting-session:in-progress';

export const sessionStore = {
  load(): InProgressSessionMetadata | undefined {
    const serialized = window.localStorage.getItem(SESSION_KEY);
    if (!serialized) {
      return undefined;
    }

    try {
      return JSON.parse(serialized) as InProgressSessionMetadata;
    } catch {
      window.localStorage.removeItem(SESSION_KEY);
      return undefined;
    }
  },
  save(metadata: InProgressSessionMetadata): void {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(metadata));
  },
  clear(): void {
    window.localStorage.removeItem(SESSION_KEY);
  },
};
