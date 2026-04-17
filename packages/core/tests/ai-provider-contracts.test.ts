import { describe, expect, it, vi } from 'vitest';

import type { MistralSmall4Client, VoxtralMiniTranscribeV2Client } from '../src/pipeline/ai-clients.js';
import { SummaryValidationError } from '../src/pipeline/summary-schema.js';
import { MeetingProcessingPipeline } from '../src/pipeline/meeting-pipeline.js';
import type { DeadLetterEntity } from '../src/storage/types.js';
import type { PersistedPipelineResult, PersistenceRepository } from '../src/storage/repository.js';

class InMemoryRepository implements Pick<PersistenceRepository, 'persistPipelineResult' | 'addDeadLetter'> {
  public persisted: PersistedPipelineResult | undefined;
  public deadLetters: DeadLetterEntity[] = [];

  public persistPipelineResult(result: PersistedPipelineResult): void {
    this.persisted = result;
  }

  public addDeadLetter(deadLetter: DeadLetterEntity): void {
    this.deadLetters.push(deadLetter);
  }
}

describe('AI provider boundary contracts', () => {
  it('maps mocked transcription + summary provider responses into persisted aggregate', async () => {
    const voxtralClient: VoxtralMiniTranscribeV2Client = {
      transcribeAudio: vi.fn(async () => ({
        text: 'Alice: we should ship by Friday',
        segments: ['Alice: we should ship', 'by Friday'],
        timestamps: [0, 2],
      })),
    };

    const mistralClient: MistralSmall4Client = {
      summarizeTranscript: vi.fn(async () => ({
        structuredJson: {
          actionItems: ['Ship by Friday'],
          relevantHeadings: ['Release timing'],
          decisions: ['Ship by Friday'],
          openQuestions: ['Any blockers?'],
          followUps: ['Confirm QA sign-off'],
        },
        editableText: 'Team agreed to ship by Friday.',
        noteMarkdown: '- ship by Friday',
        actionItems: [{ text: 'Ship by Friday', checked: false, orderIndex: 0 }],
      })),
    };

    const repository = new InMemoryRepository();
    const pipeline = new MeetingProcessingPipeline({
      voxtralClient,
      mistralClient,
      repository: repository as PersistenceRepository,
    });

    const result = await pipeline.process({
      meetingId: 'm-ai-1',
      title: 'Release Planning',
      datetime: '2026-04-17T08:30:00.000Z',
      platform: 'teams',
      duration: 1200,
      audioFilePath: '/tmp/audio.wav',
    });

    expect(voxtralClient.transcribeAudio).toHaveBeenCalledWith('/tmp/audio.wav');
    expect(mistralClient.summarizeTranscript).toHaveBeenCalledWith('Alice: we should ship by Friday');

    expect(result.summary.structuredJson).toEqual({
      actionItems: ['Ship by Friday'],
      relevantHeadings: ['Release timing'],
      decisions: ['Ship by Friday'],
      openQuestions: ['Any blockers?'],
      followUps: ['Confirm QA sign-off'],
    });
    expect(result.actionItems).toEqual([
      { meetingId: 'm-ai-1', text: 'Ship by Friday', checked: false, orderIndex: 0 },
    ]);

    expect(repository.persisted).toBeDefined();
    expect(repository.persisted?.transcript.segments).toEqual(['Alice: we should ship', 'by Friday']);
  });

  it('routes invalid summary schema payloads to dead letters with context', async () => {
    const voxtralClient: VoxtralMiniTranscribeV2Client = {
      transcribeAudio: vi.fn(async () => ({
        text: 'Transcript for invalid schema test',
        segments: ['Transcript for invalid schema test'],
        timestamps: [0],
      })),
    };

    const mistralClient: MistralSmall4Client = {
      summarizeTranscript: vi.fn(async () => {
        throw new SummaryValidationError(
          'Invalid summary response schema.',
          [],
          { structuredJson: { actionItems: [] } },
        );
      }),
    };

    const repository = new InMemoryRepository();
    const pipeline = new MeetingProcessingPipeline({
      voxtralClient,
      mistralClient,
      repository: repository as PersistenceRepository,
      retryOptions: { maxAttempts: 1, initialDelayMs: 1, maxDelayMs: 1, backoffMultiplier: 1 },
    });

    await expect(
      pipeline.process({
        meetingId: 'm-ai-invalid',
        title: 'Release Planning',
        datetime: '2026-04-17T08:30:00.000Z',
        platform: 'teams',
        duration: 1200,
        audioFilePath: '/tmp/audio.wav',
      }),
    ).rejects.toBeInstanceOf(SummaryValidationError);

    expect(repository.persisted).toBeUndefined();
    expect(repository.deadLetters).toHaveLength(2);
    expect(repository.deadLetters[0]).toMatchObject({
      stage: 'summarize',
      attempts: 1,
    });
    expect(repository.deadLetters[1]).toMatchObject({
      stage: 'summarize',
      attempts: 0,
    });
    expect(repository.deadLetters[1]?.payload).toMatchObject({
      transcript: 'Transcript for invalid schema test',
      rawModelOutput: { structuredJson: { actionItems: [] } },
    });
  });
});
