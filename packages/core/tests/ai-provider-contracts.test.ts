import { describe, expect, it, vi } from 'vitest';

import type { MistralSmall4Client, VoxtralMiniTranscribeV2Client } from '../src/pipeline/ai-clients.js';
import { MeetingProcessingPipeline } from '../src/pipeline/meeting-pipeline.js';
import type { PersistedPipelineResult, PersistenceRepository } from '../src/storage/repository.js';

class InMemoryRepository implements Pick<PersistenceRepository, 'persistPipelineResult' | 'addDeadLetter'> {
  public persisted: PersistedPipelineResult | undefined;

  public persistPipelineResult(result: PersistedPipelineResult): void {
    this.persisted = result;
  }

  public addDeadLetter(): void {
    // no-op for contract tests
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
      summarizeTranscript: vi.fn(async (transcriptText: string) => ({
        structuredJson: { summary: 'Ship this week', sourceLength: transcriptText.length },
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

    expect(result.summary.structuredJson).toEqual({ summary: 'Ship this week', sourceLength: 31 });
    expect(result.actionItems).toEqual([
      { meetingId: 'm-ai-1', text: 'Ship by Friday', checked: false, orderIndex: 0 },
    ]);

    expect(repository.persisted).toBeDefined();
    expect(repository.persisted?.transcript.segments).toEqual(['Alice: we should ship', 'by Friday']);
  });
});
