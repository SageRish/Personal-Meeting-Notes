import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { BackgroundMeetingDetectionService } from '../src/meeting-detection/background-service.js';
import type { MeetingDetectorAdapter, MeetingPresenceSnapshot } from '../src/meeting-detection/types.js';
import { MeetingProcessingPipeline } from '../src/pipeline/meeting-pipeline.js';
import type { MistralSmall4Client, VoxtralMiniTranscribeV2Client } from '../src/pipeline/ai-clients.js';
import { StorageDatabase } from '../src/storage/database.js';
import { PersistenceRepository } from '../src/storage/repository.js';

function createSnapshot(
  state: MeetingPresenceSnapshot['state'],
  observedAt: string,
  meetingId?: string,
): MeetingPresenceSnapshot {
  return {
    platform: 'zoom',
    state,
    observedAt,
    ...(meetingId ? { meetingId } : {}),
  };
}

describe('BackgroundMeetingDetectionService event transitions', () => {
  const cleanupFns: Array<() => void> = [];

  afterEach(() => {
    while (cleanupFns.length > 0) {
      cleanupFns.pop()?.();
    }
  });

  it('emits started, ended, and unknown transitions as snapshots change', () => {
    const observedEvents: string[] = [];

    const adapter: MeetingDetectorAdapter = {
      platform: 'zoom',
      poll: async () => createSnapshot('inactive', '2026-04-17T10:00:00.000Z'),
      subscribe: (onSnapshot) => {
        onSnapshot(createSnapshot('active', '2026-04-17T10:01:00.000Z', 'zoom-1'));
        onSnapshot(createSnapshot('active', '2026-04-17T10:02:00.000Z', 'zoom-1'));
        onSnapshot(createSnapshot('inactive', '2026-04-17T10:03:00.000Z'));
        onSnapshot(createSnapshot('unknown', '2026-04-17T10:04:00.000Z'));
        return () => undefined;
      },
    };

    const service = new BackgroundMeetingDetectionService({
      adapters: [adapter],
      pollingIntervalMs: 60_000,
      onEvent: (event) => {
        observedEvents.push(`${event.type}:${event.meetingId ?? 'none'}`);
      },
    });

    service.start();
    service.stop();

    expect(observedEvents).toEqual([
      'meeting_started:zoom-1',
      'meeting_ended:zoom-1',
      'meeting_unknown:none',
    ]);
  });

  it('runs end-to-end detection, processing, persistence, and persisted edit flow', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'meeting-notes-core-integration-'));
    const dbPath = join(tempDirectory, 'integration.sqlite');
    const storage = new StorageDatabase({ dbPath });
    cleanupFns.push(() => {
      storage.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    });

    const repository = new PersistenceRepository(storage.connection);
    const audioCalls: string[] = [];
    const summaryCalls: string[] = [];

    const voxtralClient: VoxtralMiniTranscribeV2Client = {
      async transcribeAudio(audioFilePath: string) {
        audioCalls.push(audioFilePath);

        return {
          text: `Transcript for ${audioFilePath}`,
          segments: ['Intro context', 'Decision and owner assignment'],
          timestamps: [0, 47],
        };
      },
    };

    const mistralClient: MistralSmall4Client = {
      async summarizeTranscript(transcriptText: string) {
        summaryCalls.push(transcriptText);

        if (transcriptText.includes('broken-audio')) {
          throw new Error('mock summarizer failure');
        }

        return {
          structuredJson: {
            actionItems: ['Send project recap'],
            relevantHeadings: ['Project status'],
            decisions: ['Ship candidate build'],
            openQuestions: ['Need rollout gate approval?'],
            followUps: ['Confirm launch checklist'],
          },
          editableText: 'Initial generated summary',
          noteMarkdown: '## Initial notes',
          actionItems: [
            {
              text: 'Send project recap',
              checked: false,
              orderIndex: 0,
            },
          ],
        };
      },
    };

    const stageEvents: string[] = [];
    const pipeline = new MeetingProcessingPipeline({
      voxtralClient,
      mistralClient,
      repository,
      retryOptions: {
        maxAttempts: 1,
        initialDelayMs: 1,
        backoffMultiplier: 1,
        maxDelayMs: 1,
      },
      onEvent: (event) => {
        stageEvents.push(`${event.meetingId}:${event.stage}`);
      },
    });

    const observedDetectionEvents: string[] = [];
    let startedProcessingPromise: Promise<unknown> | undefined;

    const adapter: MeetingDetectorAdapter = {
      platform: 'zoom',
      poll: async () => createSnapshot('inactive', '2026-04-17T11:00:00.000Z'),
      subscribe: (onSnapshot) => {
        onSnapshot(createSnapshot('active', '2026-04-17T11:01:00.000Z', 'zoom-sync-42'));
        onSnapshot(createSnapshot('inactive', '2026-04-17T11:12:00.000Z'));
        return () => undefined;
      },
    };

    const detectionService = new BackgroundMeetingDetectionService({
      adapters: [adapter],
      pollingIntervalMs: 60_000,
      onEvent: (event) => {
        observedDetectionEvents.push(`${event.type}:${event.meetingId ?? 'none'}`);

        if (event.type === 'meeting_started' && event.meetingId) {
          startedProcessingPromise = pipeline.process({
            meetingId: event.meetingId,
            title: 'Weekly Engineering Sync',
            datetime: '2026-04-17T11:00:00.000Z',
            platform: 'zoom',
            duration: 1800,
            audioFilePath: '/tmp/mock-audio.wav',
          });
        }
      },
    });

    detectionService.start();
    detectionService.stop();
    await startedProcessingPromise;

    await expect(
      pipeline.process({
        meetingId: 'zoom-sync-err',
        title: 'Failure Case Meeting',
        datetime: '2026-04-17T12:00:00.000Z',
        platform: 'zoom',
        duration: 600,
        audioFilePath: '/tmp/broken-audio.wav',
      }),
    ).rejects.toThrow('mock summarizer failure');

    const actionItemRow = storage.connection
      .prepare('SELECT id FROM action_items WHERE meeting_id = ? ORDER BY order_index ASC LIMIT 1')
      .get('zoom-sync-42') as { id: number };

    repository.upsertSummary(
      {
        meetingId: 'zoom-sync-42',
        editableText: 'Edited summary from Summary tab',
        structuredJson: {
          actionItems: ['Send project recap'],
          relevantHeadings: ['Project status'],
          decisions: ['Ship candidate build'],
          openQuestions: ['Need rollout gate approval?'],
          followUps: ['Confirm launch checklist'],
        },
      },
    );
    repository.upsertNotes({
      meetingId: 'zoom-sync-42',
      editableMarkdown: '## Edited note from Notes tab',
    });
    repository.updateActionItemChecked('zoom-sync-42', actionItemRow.id, true);

    const detail = repository.getMeetingDetail('zoom-sync-42');
    expect(detail?.summary?.editableText).toBe('Edited summary from Summary tab');
    expect(detail?.notes?.editableMarkdown).toBe('## Edited note from Notes tab');
    expect(detail?.transcript?.segments).toEqual(['Intro context', 'Decision and owner assignment']);
    expect(detail?.actionItems[0]?.checked).toBe(true);

    const tableCounts = {
      meetings: storage.connection.prepare('SELECT COUNT(*) AS value FROM meetings').get() as { value: number },
      transcripts: storage.connection.prepare('SELECT COUNT(*) AS value FROM transcripts').get() as { value: number },
      summaries: storage.connection.prepare('SELECT COUNT(*) AS value FROM summaries').get() as { value: number },
      notes: storage.connection.prepare('SELECT COUNT(*) AS value FROM notes').get() as { value: number },
      actionItems: storage.connection.prepare('SELECT COUNT(*) AS value FROM action_items').get() as { value: number },
      deadLetters: storage.connection.prepare('SELECT COUNT(*) AS value FROM dead_letters').get() as { value: number },
    };

    expect(observedDetectionEvents).toEqual(['meeting_started:zoom-sync-42', 'meeting_ended:zoom-sync-42']);
    expect(audioCalls).toEqual(['/tmp/mock-audio.wav', '/tmp/broken-audio.wav']);
    expect(summaryCalls).toEqual(['Transcript for /tmp/mock-audio.wav', 'Transcript for /tmp/broken-audio.wav']);
    expect(stageEvents).toEqual([
      'zoom-sync-42:ingest',
      'zoom-sync-42:transcribe',
      'zoom-sync-42:summarize',
      'zoom-sync-42:persist',
      'zoom-sync-42:ui_update',
      'zoom-sync-42:completed',
      'zoom-sync-err:ingest',
      'zoom-sync-err:transcribe',
      'zoom-sync-err:failed',
    ]);
    expect(tableCounts.meetings.value).toBe(1);
    expect(tableCounts.transcripts.value).toBe(1);
    expect(tableCounts.summaries.value).toBe(1);
    expect(tableCounts.notes.value).toBe(1);
    expect(tableCounts.actionItems.value).toBe(1);
    expect(tableCounts.deadLetters.value).toBe(1);
  });
});
