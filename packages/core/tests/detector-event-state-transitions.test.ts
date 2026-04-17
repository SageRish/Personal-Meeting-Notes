import { describe, expect, it } from 'vitest';

import { BackgroundMeetingDetectionService } from '../src/meeting-detection/background-service.js';
import type { MeetingDetectorAdapter, MeetingPresenceSnapshot } from '../src/meeting-detection/types.js';

function createSnapshot(
  state: MeetingPresenceSnapshot['state'],
  observedAt: string,
  meetingId?: string,
): MeetingPresenceSnapshot {
  return {
    platform: 'zoom',
    state,
    observedAt,
    ...(meetingId ? { meetingId } : {}),
  };
}

describe('BackgroundMeetingDetectionService event transitions', () => {
  it('emits started, ended, and unknown transitions as snapshots change', () => {
    const observedEvents: string[] = [];

    const adapter: MeetingDetectorAdapter = {
      platform: 'zoom',
      poll: async () => createSnapshot('inactive', '2026-04-17T10:00:00.000Z'),
      subscribe: (onSnapshot) => {
        onSnapshot(createSnapshot('active', '2026-04-17T10:01:00.000Z', 'zoom-1'));
        onSnapshot(createSnapshot('active', '2026-04-17T10:02:00.000Z', 'zoom-1'));
        onSnapshot(createSnapshot('inactive', '2026-04-17T10:03:00.000Z'));
        onSnapshot(createSnapshot('unknown', '2026-04-17T10:04:00.000Z'));
        return () => undefined;
      },
    };

    const service = new BackgroundMeetingDetectionService({
      adapters: [adapter],
      pollingIntervalMs: 60_000,
      onEvent: (event) => {
        observedEvents.push(`${event.type}:${event.meetingId ?? 'none'}`);
      },
    });

    service.start();
    service.stop();

    expect(observedEvents).toEqual([
      'meeting_started:zoom-1',
      'meeting_ended:zoom-1',
      'meeting_unknown:none',
    ]);
  });
});
