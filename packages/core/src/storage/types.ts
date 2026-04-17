import type { StructuredSummary } from '../pipeline/summary-schema.js';

export type MeetingStatus = 'scheduled' | 'in_progress' | 'processed' | 'failed';

export interface MeetingEntity {
  id: string;
  title: string;
  datetime: string;
  platform: string;
  duration: number;
  status: MeetingStatus;
  transcriptAvailable: boolean;
}

export interface TranscriptEntity {
  meetingId: string;
  text: string;
  segments: string[];
  timestamps: number[];
}

export interface SummaryEntity {
  meetingId: string;
  structuredJson: StructuredSummary;
  editableText: string;
}

export interface NoteEntity {
  meetingId: string;
  editableMarkdown: string;
}

export interface ActionItemEntity {
  id?: number;
  meetingId: string;
  text: string;
  checked: boolean;
  orderIndex: number;
}

export interface DeadLetterEntity {
  id?: number;
  meetingId?: string;
  stage: string;
  payload: unknown;
  errorMessage: string;
  attempts: number;
  failedAt?: string;
}
