import type Database from 'better-sqlite3';

import type {
  ActionItemEntity,
  DeadLetterEntity,
  MeetingEntity,
  MeetingStatus,
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

export interface MeetingListFilters {
  platform?: string;
  status?: MeetingStatus;
  startDate?: string;
  endDate?: string;
  query?: string;
}

export interface MeetingListItem extends MeetingEntity {}

export interface RecentMeetingGroup {
  date: string;
  meetings: MeetingListItem[];
}

export interface MeetingDetail {
  meeting: MeetingEntity;
  summary: SummaryEntity | null;
  notes: NoteEntity | null;
  transcript: TranscriptEntity | null;
  actionItems: ActionItemEntity[];
}

export class PersistenceRepository {
  public constructor(private readonly database: Database) {}

  private buildFilters(filters: MeetingListFilters): { whereClause: string; params: Record<string, unknown> } {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (filters.platform) {
      conditions.push('m.platform = @platform');
      params.platform = filters.platform;
    }

    if (filters.status) {
      conditions.push('m.status = @status');
      params.status = filters.status;
    }

    if (filters.startDate) {
      conditions.push('m.datetime >= @start_date');
      params.start_date = filters.startDate;
    }

    if (filters.endDate) {
      conditions.push('m.datetime <= @end_date');
      params.end_date = filters.endDate;
    }

    if (filters.query) {
      conditions.push('(LOWER(m.title) LIKE @query OR LOWER(COALESCE(n.editable_markdown, \'\')) LIKE @query)');
      params.query = `%${filters.query.trim().toLowerCase()}%`;
    }

    return {
      whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
    };
  }

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

  public updateActionItemChecked(meetingId: string, actionItemId: number, checked: boolean): void {
    this.database
      .prepare(
        `
      UPDATE action_items
      SET checked = @checked
      WHERE id = @id AND meeting_id = @meeting_id
    `,
      )
      .run({
        id: actionItemId,
        meeting_id: meetingId,
        checked: Number(checked),
      });
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

  public queryUpcomingMeetings(filters: MeetingListFilters = {}, limit = 3): MeetingListItem[] {
    const baseFilters = this.buildFilters(filters);
    const whereClause = [baseFilters.whereClause, "m.status IN ('scheduled', 'in_progress')"]
      .filter((clause) => clause.length > 0)
      .join(baseFilters.whereClause.length > 0 ? ' AND ' : ' WHERE ');

    const rows = this.database
      .prepare(
        `
        SELECT m.id, m.title, m.datetime, m.platform, m.duration, m.status, m.transcript_available
        FROM meetings m
        LEFT JOIN notes n ON n.meeting_id = m.id
        ${whereClause}
        ORDER BY m.datetime ASC
        LIMIT @limit
      `,
      )
      .all({ ...baseFilters.params, limit }) as Array<{
      id: string;
      title: string;
      datetime: string;
      platform: string;
      duration: number;
      status: MeetingStatus;
      transcript_available: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      datetime: row.datetime,
      platform: row.platform,
      duration: row.duration,
      status: row.status,
      transcriptAvailable: Boolean(row.transcript_available),
    }));
  }

  public queryRecentGroupedMeetings(filters: MeetingListFilters = {}): RecentMeetingGroup[] {
    const baseFilters = this.buildFilters(filters);
    const whereClause = [baseFilters.whereClause, "m.status NOT IN ('scheduled', 'in_progress')"]
      .filter((clause) => clause.length > 0)
      .join(baseFilters.whereClause.length > 0 ? ' AND ' : ' WHERE ');

    const rows = this.database
      .prepare(
        `
        SELECT m.id, m.title, m.datetime, m.platform, m.duration, m.status, m.transcript_available
        FROM meetings m
        LEFT JOIN notes n ON n.meeting_id = m.id
        ${whereClause}
        ORDER BY m.datetime DESC
      `,
      )
      .all(baseFilters.params) as Array<{
      id: string;
      title: string;
      datetime: string;
      platform: string;
      duration: number;
      status: MeetingStatus;
      transcript_available: number;
    }>;

    const groups = new Map<string, MeetingListItem[]>();
    for (const row of rows) {
      const dateKey = row.datetime.slice(0, 10);
      const meeting: MeetingListItem = {
        id: row.id,
        title: row.title,
        datetime: row.datetime,
        platform: row.platform,
        duration: row.duration,
        status: row.status,
        transcriptAvailable: Boolean(row.transcript_available),
      };
      groups.set(dateKey, [...(groups.get(dateKey) ?? []), meeting]);
    }

    return [...groups.entries()].map(([date, meetings]) => ({ date, meetings }));
  }

  public getMeetingDetail(meetingId: string): MeetingDetail | null {
    const meetingRow = (this.database.prepare(
        `
      SELECT id, title, datetime, platform, duration, status, transcript_available
      FROM meetings
      WHERE id = ?
    `,
      ) as Database.Statement)
      .get(meetingId) as
      | {
          id: string;
          title: string;
          datetime: string;
          platform: string;
          duration: number;
          status: MeetingStatus;
          transcript_available: number;
        }
      | undefined;

    if (!meetingRow) {
      return null;
    }

    const transcript = (this.database.prepare(
      'SELECT meeting_id, text, segments, timestamps FROM transcripts WHERE meeting_id = ?',
    ) as Database.Statement)
      .get(meetingId) as
      | {
          meeting_id: string;
          text: string;
          segments: string;
          timestamps: string;
        }
      | undefined;

    const summary = (this.database.prepare(
      'SELECT meeting_id, structured_json, editable_text FROM summaries WHERE meeting_id = ?',
    ) as Database.Statement)
      .get(meetingId) as
      | {
          meeting_id: string;
          structured_json: string;
          editable_text: string;
        }
      | undefined;

    const note = (this.database.prepare('SELECT meeting_id, editable_markdown FROM notes WHERE meeting_id = ?') as Database.Statement)
      .get(meetingId) as
      | {
          meeting_id: string;
          editable_markdown: string;
        }
      | undefined;

    const actionItems = this.database
      .prepare('SELECT id, meeting_id, text, checked, order_index FROM action_items WHERE meeting_id = ? ORDER BY order_index ASC')
      .all(meetingId) as Array<{
      id: number;
      meeting_id: string;
      text: string;
      checked: number;
      order_index: number;
    }>;

    return {
      meeting: {
        id: meetingRow.id,
        title: meetingRow.title,
        datetime: meetingRow.datetime,
        platform: meetingRow.platform,
        duration: meetingRow.duration,
        status: meetingRow.status,
        transcriptAvailable: Boolean(meetingRow.transcript_available),
      },
      transcript: transcript
        ? {
            meetingId: transcript.meeting_id,
            text: transcript.text,
            segments: JSON.parse(transcript.segments) as string[],
            timestamps: JSON.parse(transcript.timestamps) as number[],
          }
        : null,
      summary: summary
        ? {
            meetingId: summary.meeting_id,
            structuredJson: JSON.parse(summary.structured_json) as Record<string, unknown>,
            editableText: summary.editable_text,
          }
        : null,
      notes: note
        ? {
            meetingId: note.meeting_id,
            editableMarkdown: note.editable_markdown,
          }
        : null,
      actionItems: actionItems.map((item) => ({
        id: item.id,
        meetingId: item.meeting_id,
        text: item.text,
        checked: Boolean(item.checked),
        orderIndex: item.order_index,
      })),
    };
  }
}
