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
        structuredJson: { topLine: 'Done' },
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
});
