import type Database from 'better-sqlite3';

import type {
  ActionItemEntity,
  DeadLetterEntity,
  MeetingEntity,
  NoteEntity,
  SummaryEntity,
  TranscriptEntity,
} from './types.js';

export interface PersistedPipelineResult {
  meeting: MeetingEntity;
  transcript: TranscriptEntity;
  summary: SummaryEntity;
  note: NoteEntity;
  actionItems: ActionItemEntity[];
}

export class PersistenceRepository {
  public constructor(private readonly database: Database) {}

  public upsertMeeting(meeting: MeetingEntity): void {
    this.database
      .prepare(
        `
      INSERT INTO meetings(id, title, datetime, platform, duration, status, transcript_available)
      VALUES (@id, @title, @datetime, @platform, @duration, @status, @transcript_available)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        datetime = excluded.datetime,
        platform = excluded.platform,
        duration = excluded.duration,
        status = excluded.status,
        transcript_available = excluded.transcript_available,
        updated_at = CURRENT_TIMESTAMP
    `,
      )
      .run({
        id: meeting.id,
        title: meeting.title,
        datetime: meeting.datetime,
        platform: meeting.platform,
        duration: meeting.duration,
        status: meeting.status,
        transcript_available: Number(meeting.transcriptAvailable),
      });
  }

  public upsertTranscript(transcript: TranscriptEntity): void {
    this.database
      .prepare(
        `
      INSERT INTO transcripts(meeting_id, text, segments, timestamps)
      VALUES (@meeting_id, @text, @segments, @timestamps)
      ON CONFLICT(meeting_id) DO UPDATE SET
        text = excluded.text,
        segments = excluded.segments,
        timestamps = excluded.timestamps,
        updated_at = CURRENT_TIMESTAMP
    `,
      )
      .run({
        meeting_id: transcript.meetingId,
        text: transcript.text,
        segments: JSON.stringify(transcript.segments),
        timestamps: JSON.stringify(transcript.timestamps),
      });
  }

  public upsertSummary(summary: SummaryEntity): void {
    this.database
      .prepare(
        `
      INSERT INTO summaries(meeting_id, structured_json, editable_text)
      VALUES (@meeting_id, @structured_json, @editable_text)
      ON CONFLICT(meeting_id) DO UPDATE SET
        structured_json = excluded.structured_json,
        editable_text = excluded.editable_text,
        updated_at = CURRENT_TIMESTAMP
    `,
      )
      .run({
        meeting_id: summary.meetingId,
        structured_json: JSON.stringify(summary.structuredJson),
        editable_text: summary.editableText,
      });
  }

  public upsertNotes(note: NoteEntity): void {
    this.database
      .prepare(
        `
      INSERT INTO notes(meeting_id, editable_markdown)
      VALUES (@meeting_id, @editable_markdown)
      ON CONFLICT(meeting_id) DO UPDATE SET
        editable_markdown = excluded.editable_markdown,
        updated_at = CURRENT_TIMESTAMP
    `,
      )
      .run({
        meeting_id: note.meetingId,
        editable_markdown: note.editableMarkdown,
      });
  }

  public replaceActionItems(meetingId: string, items: ActionItemEntity[]): void {
    const transaction = this.database.transaction(() => {
      this.database.prepare('DELETE FROM action_items WHERE meeting_id = ?').run(meetingId);

      const insertActionItem = this.database.prepare(
        `
          INSERT INTO action_items(meeting_id, text, checked, order_index)
          VALUES (@meeting_id, @text, @checked, @order_index)
        `,
      );

      for (const item of items) {
        insertActionItem.run({
          meeting_id: meetingId,
          text: item.text,
          checked: Number(item.checked),
          order_index: item.orderIndex,
        });
      }
    });

    transaction();
  }

  public persistPipelineResult(result: PersistedPipelineResult): void {
    const transaction = this.database.transaction(() => {
      this.upsertMeeting(result.meeting);
      this.upsertTranscript(result.transcript);
      this.upsertSummary(result.summary);
      this.upsertNotes(result.note);
      this.replaceActionItems(result.meeting.id, result.actionItems);
    });

    transaction();
  }

  public addDeadLetter(deadLetter: DeadLetterEntity): void {
    this.database
      .prepare(
        `
      INSERT INTO dead_letters(meeting_id, stage, payload, error_message, attempts)
      VALUES (@meeting_id, @stage, @payload, @error_message, @attempts)
    `,
      )
      .run({
        meeting_id: deadLetter.meetingId ?? null,
        stage: deadLetter.stage,
        payload: JSON.stringify(deadLetter.payload),
        error_message: deadLetter.errorMessage,
        attempts: deadLetter.attempts,
      });
  }
}
