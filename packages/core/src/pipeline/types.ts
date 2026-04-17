import type { ActionItemEntity, MeetingEntity, NoteEntity, SummaryEntity, TranscriptEntity } from '../storage/types.js';
import type { StructuredSummary } from './summary-schema.js';

export interface AudioIngestPayload {
  meetingId: string;
  title: string;
  datetime: string;
  platform: string;
  duration: number;
  audioFilePath: string;
}

export interface TranscriptionResponse {
  text: string;
  segments: string[];
  timestamps: number[];
}

export interface SummaryResponse {
  structuredJson: StructuredSummary;
  editableText: string;
  noteMarkdown: string;
  actionItems: Array<Pick<ActionItemEntity, 'text' | 'checked' | 'orderIndex'>>;
}

export interface PipelineStageEvent {
  meetingId: string;
  stage: 'ingest' | 'transcribe' | 'summarize' | 'persist' | 'ui_update' | 'failed' | 'completed';
  message: string;
  at: string;
}

export interface ProcessedMeetingPayload {
  meeting: MeetingEntity;
  transcript: TranscriptEntity;
  summary: SummaryEntity;
  note: NoteEntity;
  actionItems: ActionItemEntity[];
}
