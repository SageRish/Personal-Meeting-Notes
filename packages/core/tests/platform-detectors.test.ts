import { describe, expect, it } from 'vitest';

import { TeamsDetector } from '../src/meeting-detection/adapters/teams-detector.js';
import { ZoomDetector } from '../src/meeting-detection/adapters/zoom-detector.js';

describe('TeamsDetector', () => {
  it('returns active with stable meetingId for an active session and inactive when it ends', async () => {
    const now = () => new Date('2026-04-17T10:00:00.000Z');
    const detector = new TeamsDetector({
      now,
      signalSource: async () => [
        {
          processName: 'ms-teams',
          sessionId: 'session-123',
          meetingUrl: 'https://teams.microsoft.com/l/meetup-join/abc',
          callStatus: 'in_meeting',
          pid: 1100,
          startedAt: '2026-04-17T09:58:00.000Z',
        },
      ],
    });

    const first = await detector.poll();
    const second = await detector.poll();

    expect(first.state).toBe('active');
    expect(first.meetingId).toBeDefined();
    expect(second.meetingId).toBe(first.meetingId);
    expect(first.confidence).toBeGreaterThanOrEqual(0.9);

    const inactive = new TeamsDetector({
      now,
      signalSource: async () => [],
    });

    const ended = await inactive.poll();
    expect(ended.state).toBe('inactive');
    expect(ended.meetingId).toBeUndefined();
    expect(ended.confidence).toBe(1);
  });

  it('returns unknown only when evidence is insufficient', async () => {
    const detector = new TeamsDetector({
      now: () => new Date('2026-04-17T10:00:00.000Z'),
      signalSource: async () => [
        {
          processName: 'ms-teams',
          windowTitle: 'Microsoft Teams',
          callStatus: 'idle',
          pid: 777,
        },
      ],
    });

    const snapshot = await detector.poll();
    expect(snapshot.state).toBe('unknown');
    expect(snapshot.confidence).toBeGreaterThan(0);
    expect(snapshot.confidence).toBeLessThan(0.6);
  });
});

describe('ZoomDetector', () => {
  it('returns active with stable meetingId for an active session and unknown for weak evidence', async () => {
    const detector = new ZoomDetector({
      now: () => new Date('2026-04-17T11:00:00.000Z'),
      signalSource: async () => [
        {
          processName: 'zoom.us',
          windowTitle: 'Zoom Meeting - Product Standup',
          meetingUrl: 'https://zoom.us/j/123456789',
          sessionId: 'zoom-session-123456789',
          callStatus: 'in_meeting',
          pid: 2200,
          startedAt: '2026-04-17T10:55:00.000Z',
        },
      ],
    });

    const active = await detector.poll();
    const activeAgain = await detector.poll();

    expect(active.state).toBe('active');
    expect(active.meetingId).toBe(activeAgain.meetingId);
    expect(active.confidence).toBeGreaterThanOrEqual(0.9);

    const unknownDetector = new ZoomDetector({
      now: () => new Date('2026-04-17T11:05:00.000Z'),
      signalSource: async () => [
        {
          processName: 'zoom.us',
          windowTitle: 'Zoom',
          callStatus: 'idle',
          pid: 2200,
        },
      ],
    });

    const unknown = await unknownDetector.poll();
    expect(unknown.state).toBe('unknown');
    expect(unknown.confidence).toBeGreaterThan(0);
    expect(unknown.confidence).toBeLessThan(0.6);
  });

  it('returns inactive after meeting process disappears', async () => {
    const detector = new ZoomDetector({
      now: () => new Date('2026-04-17T11:10:00.000Z'),
      signalSource: async () => [],
    });

    const snapshot = await detector.poll();
    expect(snapshot.state).toBe('inactive');
    expect(snapshot.meetingId).toBeUndefined();
    expect(snapshot.confidence).toBe(1);
  });
});
