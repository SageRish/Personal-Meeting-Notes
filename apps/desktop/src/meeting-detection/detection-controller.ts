import {
  BackgroundMeetingDetectionService,
  TeamsDetector,
  ZoomDetector,
  type MeetingDetectionEvent,
  type MeetingState,
} from '@meetings/core';

const randomState = (): MeetingState => {
  const value = Math.random();
  if (value < 0.05) {
    return 'unknown';
  }

  if (value < 0.2) {
    return 'active';
  }

  return 'inactive';
};

export function createDetectionController(onEvent: (event: MeetingDetectionEvent) => void): BackgroundMeetingDetectionService {
  const teams = new TeamsDetector({
    getSnapshot: async () => ({
      state: randomState(),
      meetingId: `teams-${Math.floor(Date.now() / 60_000)}`,
      confidence: 0.75,
    }),
  });

  const zoom = new ZoomDetector({
    getSnapshot: async () => ({
      state: randomState(),
      meetingId: `zoom-${Math.floor(Date.now() / 60_000)}`,
      confidence: 0.78,
    }),
  });

  return new BackgroundMeetingDetectionService({
    adapters: [teams, zoom],
    pollingIntervalMs: 7_500,
    onEvent,
  });
}
