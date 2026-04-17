export type MeetingId = string;
export { ConfigValidationError, loadConfig, type AppConfig } from './config/env.js';
export { createRedactingLoggerMiddleware, redactSensitiveData, withRedactedLogging } from './logging/redaction.js';
export * from './pipeline/index.js';
export * from './meeting-detection/index.js';
export { OsNativeSecretStore, type SecretStore } from './secrets/secret-store.js';
export * from './storage/index.js';

export interface Meeting {
  id: MeetingId;
  title: string;
  scheduledAt: string;
  participants: string[];
}

export interface MeetingsService {
  getMeetings(): Meeting[];
}

const seedMeetings: Meeting[] = [
  {
    id: 'm-1',
    title: 'Weekly Product Sync',
    scheduledAt: 'Monday 10:00 AM',
    participants: ['Avery', 'Jordan', 'Morgan'],
  },
  {
    id: 'm-2',
    title: 'Customer Discovery Interview',
    scheduledAt: 'Tuesday 1:30 PM',
    participants: ['Taylor', 'Alex'],
  },
];

export class MeetingService implements MeetingsService {
  public getMeetings(): Meeting[] {
    return seedMeetings;
  }
}
