import {
  MeetingProcessingPipeline,
  PersistenceRepository,
  StorageDatabase,
  type AudioIngestPayload,
  type MistralSmall4Client,
  type PipelineStageEvent,
  type ProcessedMeetingPayload,
  type VoxtralMiniTranscribeV2Client,
} from '@meetings/core';

class DesktopVoxtralClient implements VoxtralMiniTranscribeV2Client {
  public async transcribeAudio(audioFilePath: string) {
    const base = `Transcript generated from ${audioFilePath}`;

    return {
      text: `${base}. Discussed project updates and next steps.`,
      segments: [
        `${base}.`,
        'Discussed project updates and next steps.',
      ],
      timestamps: [0, 32],
    };
  }
}

class DesktopMistralClient implements MistralSmall4Client {
  public async summarizeTranscript(transcriptText: string) {
    return {
      structuredJson: {
        highlights: ['Project updates captured', 'Next steps identified'],
      },
      editableText: `Summary: ${transcriptText}`,
      noteMarkdown: `## Notes\n\n${transcriptText}`,
      actionItems: [
        {
          text: 'Review action items from generated summary.',
          checked: false,
          orderIndex: 0,
        },
      ],
    };
  }
}

const storageDatabase = new StorageDatabase({ dbPath: 'meeting-notes.sqlite' });
const persistenceRepository = new PersistenceRepository(storageDatabase.connection);
const voxtralClient = new DesktopVoxtralClient();
const mistralClient = new DesktopMistralClient();

export const desktopPipelineRuntime = {
  processMeeting(
    payload: AudioIngestPayload,
    onEvent?: (event: PipelineStageEvent) => void,
  ): Promise<ProcessedMeetingPayload> {
    const pipeline = new MeetingProcessingPipeline({
      voxtralClient,
      mistralClient,
      repository: persistenceRepository,
      onEvent,
    });

    return pipeline.process(payload);
  },
};
