export { BackgroundMeetingDetectionService, type BackgroundMeetingDetectionServiceOptions } from './background-service.js';
export { TeamsDetector, type TeamsDetectorOptions } from './adapters/teams-detector.js';
export { ZoomDetector, type ZoomDetectorOptions } from './adapters/zoom-detector.js';
export type {
  MeetingDetectionEvent,
  MeetingDetectionEventType,
  MeetingDetectorAdapter,
  MeetingPlatform,
  MeetingPresenceSnapshot,
  MeetingSourceUnsubscribe,
  MeetingState,
} from './types.js';
