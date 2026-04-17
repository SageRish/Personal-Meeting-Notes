import {
  BackgroundMeetingDetectionService,
  TeamsDetector,
  ZoomDetector,
  type MeetingDetectionEvent,
} from '@meetings/core';

export function createDetectionController(onEvent: (event: MeetingDetectionEvent) => void): BackgroundMeetingDetectionService {
  const teams = new TeamsDetector();
  const zoom = new ZoomDetector();

  return new BackgroundMeetingDetectionService({
    adapters: [teams, zoom],
    pollingIntervalMs: 7_500,
    onEvent,
  });
}
