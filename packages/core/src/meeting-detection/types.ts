export type MeetingPlatform = 'teams' | 'zoom';

export type MeetingState = 'active' | 'inactive' | 'unknown';

export interface MeetingPresenceSnapshot {
  platform: MeetingPlatform;
  state: MeetingState;
  meetingId?: string;
  confidence?: number;
  observedAt: string;
}

export type MeetingDetectionEventType = 'meeting_started' | 'meeting_ended' | 'meeting_unknown';

export interface MeetingDetectionEvent {
  type: MeetingDetectionEventType;
  platform: MeetingPlatform;
  at: string;
  meetingId?: string;
  confidence?: number;
}

export type MeetingSourceUnsubscribe = () => void;

export interface MeetingDetectorAdapter {
  readonly platform: MeetingPlatform;
  poll(): Promise<MeetingPresenceSnapshot>;
  subscribe?(onSnapshot: (snapshot: MeetingPresenceSnapshot) => void): MeetingSourceUnsubscribe;
}
