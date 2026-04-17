import type { AudioIngestPayload, MeetingPlatform } from '@meetings/core';

export interface InProgressSessionMetadata {
  meetingId: string;
  platform: MeetingPlatform;
  startedAt: string;
  captureConfirmed: boolean;
  ingestPayload?: AudioIngestPayload;
}

const keyFor = (platform: MeetingPlatform, meetingId: string): string => `meeting-session:${platform}:${meetingId}`;
const SESSION_INDEX_KEY = 'meeting-session:index';

function loadIndex(): string[] {
  try {
    const raw = window.localStorage.getItem(SESSION_INDEX_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    window.localStorage.removeItem(SESSION_INDEX_KEY);
    return [];
  }
}

function saveIndex(keys: string[]): void {
  window.localStorage.setItem(SESSION_INDEX_KEY, JSON.stringify(keys));
}

export const sessionStore = {
  load(platform: MeetingPlatform, meetingId: string): InProgressSessionMetadata | undefined {
    const serialized = window.localStorage.getItem(keyFor(platform, meetingId));
    if (!serialized) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(serialized) as InProgressSessionMetadata;
      if (parsed.platform !== platform || parsed.meetingId !== meetingId) {
        return undefined;
      }

      return parsed;
    } catch {
      window.localStorage.removeItem(keyFor(platform, meetingId));
      return undefined;
    }
  },
  save(metadata: InProgressSessionMetadata): void {
    const storageKey = keyFor(metadata.platform, metadata.meetingId);
    window.localStorage.setItem(storageKey, JSON.stringify(metadata));
    const index = loadIndex();
    if (!index.includes(storageKey)) {
      saveIndex([...index, storageKey]);
    }
  },
  clear(platform: MeetingPlatform, meetingId: string): void {
    const storageKey = keyFor(platform, meetingId);
    window.localStorage.removeItem(storageKey);
    saveIndex(loadIndex().filter((entry) => entry !== storageKey));
  },
  clearAll(): void {
    const index = loadIndex();
    index.forEach((key) => window.localStorage.removeItem(key));
    window.localStorage.removeItem(SESSION_INDEX_KEY);
  },
};
