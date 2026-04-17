import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { StorageDatabase } from '../src/storage/database.js';
import { PersistenceRepository } from '../src/storage/repository.js';

function createTestStorage(): { storage: StorageDatabase; cleanup: () => void } {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'meeting-notes-core-'));
  const dbPath = join(tempDirectory, 'test.sqlite');
  const storage = new StorageDatabase({ dbPath });

  return {
    storage,
    cleanup: () => {
      storage.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    },
  };
}

describe('PersistenceRepository storage behavior', () => {
  const cleanupFns: Array<() => void> = [];

  afterEach(() => {
    while (cleanupFns.length > 0) {
      cleanupFns.pop()?.();
    }
  });

  it('persists and upserts full pipeline aggregates', () => {
    const { storage, cleanup } = createTestStorage();
    cleanupFns.push(cleanup);

    const repository = new PersistenceRepository(storage.connection);

    repository.persistPipelineResult({
      meeting: {
        id: 'm-001',
        title: 'Sprint Planning',
        datetime: '2026-04-17T15:00:00.000Z',
        platform: 'teams',
        duration: 1800,
        status: 'processed',
        transcriptAvailable: true,
      },
      transcript: {
        meetingId: 'm-001',
        text: 'Transcript text',
        segments: ['A', 'B'],
        timestamps: [0, 15],
      },
      summary: {
        meetingId: 'm-001',
        structuredJson: { actionItems: ['Ship alpha','Email notes'], relevantHeadings: ['Sprint planning'], decisions: ['Finalize plan'], openQuestions: ['Scope concerns?'], followUps: ['Share recap'] },
        editableText: 'Summary text',
      },
      note: {
        meetingId: 'm-001',
        editableMarkdown: '- note',
      },
      actionItems: [
        { meetingId: 'm-001', text: 'Ship alpha', checked: false, orderIndex: 0 },
        { meetingId: 'm-001', text: 'Email notes', checked: true, orderIndex: 1 },
      ],
    });

    repository.upsertMeeting({
      id: 'm-001',
      title: 'Sprint Planning Updated',
      datetime: '2026-04-17T15:00:00.000Z',
      platform: 'teams',
      duration: 1860,
      status: 'processed',
      transcriptAvailable: true,
    });

    const meeting = storage.connection
      .prepare('SELECT title, duration, transcript_available FROM meetings WHERE id = ?')
      .get('m-001') as { title: string; duration: number; transcript_available: number };

    expect(meeting).toEqual({
      title: 'Sprint Planning Updated',
      duration: 1860,
      transcript_available: 1,
    });

    const relatedCounts = {
      transcripts: storage.connection.prepare('SELECT COUNT(*) AS value FROM transcripts').get() as { value: number },
      summaries: storage.connection.prepare('SELECT COUNT(*) AS value FROM summaries').get() as { value: number },
      notes: storage.connection.prepare('SELECT COUNT(*) AS value FROM notes').get() as { value: number },
      actionItems: storage.connection.prepare('SELECT COUNT(*) AS value FROM action_items').get() as { value: number },
    };

    expect(relatedCounts.transcripts.value).toBe(1);
    expect(relatedCounts.summaries.value).toBe(1);
    expect(relatedCounts.notes.value).toBe(1);
    expect(relatedCounts.actionItems.value).toBe(2);
  });

  it('persists dead letters with serialized payloads', () => {
    const { storage, cleanup } = createTestStorage();
    cleanupFns.push(cleanup);

    const repository = new PersistenceRepository(storage.connection);

    repository.addDeadLetter({
      meetingId: 'm-err-1',
      stage: 'summarize',
      payload: { transcript: 'bad transcript' },
      errorMessage: 'mock error',
      attempts: 2,
    });

    const deadLetter = storage.connection
      .prepare('SELECT meeting_id, stage, payload, error_message, attempts FROM dead_letters LIMIT 1')
      .get() as {
      meeting_id: string;
      stage: string;
      payload: string;
      error_message: string;
      attempts: number;
    };

    expect(deadLetter.meeting_id).toBe('m-err-1');
    expect(deadLetter.stage).toBe('summarize');
    expect(JSON.parse(deadLetter.payload) as { transcript: string }).toEqual({ transcript: 'bad transcript' });
    expect(deadLetter.error_message).toBe('mock error');
    expect(deadLetter.attempts).toBe(2);
  });

  it('supports repository-backed meeting list/detail queries with filters', () => {
    const { storage, cleanup } = createTestStorage();
    cleanupFns.push(cleanup);

    const repository = new PersistenceRepository(storage.connection);

    repository.persistPipelineResult({
      meeting: {
        id: 'm-upcoming',
        title: 'Upcoming Product Review',
        datetime: '2026-04-20T15:00:00.000Z',
        platform: 'zoom',
        duration: 1800,
        status: 'scheduled',
        transcriptAvailable: false,
      },
      transcript: {
        meetingId: 'm-upcoming',
        text: 'Upcoming transcript',
        segments: ['Upcoming segment'],
        timestamps: [0],
      },
      summary: {
        meetingId: 'm-upcoming',
        structuredJson: { actionItems: ['Prepare deck'], relevantHeadings: ['Upcoming review'], decisions: ['Review planned scope'], openQuestions: ['Who presents?'], followUps: ['Send agenda'] },
        editableText: 'Upcoming summary',
      },
      note: {
        meetingId: 'm-upcoming',
        editableMarkdown: 'Upcoming note',
      },
      actionItems: [{ meetingId: 'm-upcoming', text: 'Prepare deck', checked: false, orderIndex: 0 }],
    });

    repository.persistPipelineResult({
      meeting: {
        id: 'm-recent',
        title: 'Recent Engineering Sync',
        datetime: '2026-04-16T14:00:00.000Z',
        platform: 'teams',
        duration: 2700,
        status: 'processed',
        transcriptAvailable: true,
      },
      transcript: {
        meetingId: 'm-recent',
        text: 'Recent transcript',
        segments: ['Reviewed deployment', 'Assigned follow-up'],
        timestamps: [4, 29],
      },
      summary: {
        meetingId: 'm-recent',
        structuredJson: { actionItems: ['Send recap'], relevantHeadings: ['Engineering sync'], decisions: ['Deployment stable'], openQuestions: ['Need rollback plan?'], followUps: ['Follow up with support'] },
        editableText: 'Recent summary',
      },
      note: {
        meetingId: 'm-recent',
        editableMarkdown: 'Follow up with support team',
      },
      actionItems: [{ meetingId: 'm-recent', text: 'Send recap', checked: true, orderIndex: 0 }],
    });

    const upcoming = repository.queryUpcomingMeetings({ platform: 'zoom', query: 'product' });
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]).toMatchObject({
      id: 'm-upcoming',
      status: 'scheduled',
      transcriptAvailable: false,
    });

    const groupedRecent = repository.queryRecentGroupedMeetings({ status: 'processed', startDate: '2026-04-16T00:00:00.000Z' });
    expect(groupedRecent).toHaveLength(1);
    expect(groupedRecent[0]?.date).toBe('2026-04-16');
    expect(groupedRecent[0]?.meetings[0]?.id).toBe('m-recent');

    const detail = repository.getMeetingDetail('m-recent');
    expect(detail?.meeting).toMatchObject({
      id: 'm-recent',
      title: 'Recent Engineering Sync',
      transcriptAvailable: true,
    });
    expect(detail?.summary?.editableText).toBe('Recent summary');
    expect(detail?.notes?.editableMarkdown).toContain('support team');
    expect(detail?.transcript?.segments).toEqual(['Reviewed deployment', 'Assigned follow-up']);
    expect(detail?.actionItems).toHaveLength(1);
  });
});
