import type { MeetingDetectionEvent, PipelineStageEvent } from '@meetings/core';
import { useCallback, useEffect, useState } from 'react';
import { MeetingsFeature } from './features/meetings/MeetingsFeature';
import { consentStore } from './meeting-detection/consent-store';
import { createDetectionController } from './meeting-detection/detection-controller';
import { sessionStore } from './meeting-detection/session-store';
import { desktopPipelineRuntime } from './pipeline/desktop-pipeline-runtime';
import { showStartTranscriptionPrompt } from './meeting-detection/tray-notifier';

const visiblePipelineStages = new Set<PipelineStageEvent['stage']>([
  'ingest',
  'transcribe',
  'summarize',
  'persist',
  'completed',
  'failed',
]);

function buildIngestPayload(event: MeetingDetectionEvent, meetingId: string) {
  return {
    meetingId,
    title: `${event.platform.toUpperCase()} Meeting`,
    datetime: event.at,
    platform: event.platform,
    duration: 0,
    audioFilePath: `captures/${meetingId}.wav`,
  };
}

export default function App() {
  const [passiveWarning, setPassiveWarning] = useState<string | undefined>();
  const [statusMessage, setStatusMessage] = useState<string | undefined>();

  const promptForTranscription = useCallback(async (event: MeetingDetectionEvent): Promise<boolean> => {
    const priorDecision = consentStore.get(event.platform, event.meetingId);
    if (priorDecision === 'granted') {
      return true;
    }

    if (priorDecision === 'denied') {
      return false;
    }

    await showStartTranscriptionPrompt(event.platform);
    const shouldStart = window.confirm(`Start transcription for this ${event.platform} meeting now?`);
    consentStore.set(event.platform, shouldStart ? 'granted' : 'denied', event.meetingId);
    return shouldStart;
  }, []);

  const handlePipelineEvent = useCallback((event: PipelineStageEvent): void => {
    if (!visiblePipelineStages.has(event.stage)) {
      return;
    }

    setStatusMessage(`[${event.stage}] ${event.message}`);
  }, []);

  const handleMeetingStarted = useCallback(async (event: MeetingDetectionEvent): Promise<void> => {
    const meetingId = event.meetingId ?? `detected-${event.platform}-${event.at}`;
    const existingSession = sessionStore.load(event.platform, meetingId);
    if (existingSession?.captureConfirmed) {
      return;
    }

    const granted = await promptForTranscription({ ...event, meetingId });
    const ingestPayload = buildIngestPayload(event, meetingId);

    sessionStore.save({
      meetingId,
      platform: event.platform,
      startedAt: event.at,
      captureConfirmed: granted,
      ingestPayload,
    });

    setPassiveWarning(undefined);
    setStatusMessage(
      granted ? `Transcription session started. Capturing metadata for ${ingestPayload.audioFilePath}.` : 'Transcription was not started.',
    );
  }, [promptForTranscription]);

  const handleMeetingEnded = useCallback(async (event: MeetingDetectionEvent): Promise<void> => {
    if (!event.meetingId) {
      setStatusMessage('Meeting ended; no meeting id was available to finalize processing.');
      return;
    }

    const session = sessionStore.load(event.platform, event.meetingId);

    if (session?.captureConfirmed && session.ingestPayload) {
      setStatusMessage(`Meeting ended. Finalizing pipeline run for ${event.platform}.`);
      try {
        await desktopPipelineRuntime.processMeeting(session.ingestPayload, handlePipelineEvent);
      } catch (error) {
        setStatusMessage(`Pipeline execution failed: ${String(error)}`);
      }
    } else {
      setStatusMessage('Meeting ended without an active transcription session.');
    }

    sessionStore.clear(event.platform, event.meetingId);
  }, [handlePipelineEvent]);

  const handleDetectionEvent = useCallback((event: MeetingDetectionEvent): void => {
    if (event.type === 'meeting_started') {
      void handleMeetingStarted(event);
      return;
    }

    if (event.type === 'meeting_ended') {
      void handleMeetingEnded(event);
      return;
    }

    setPassiveWarning(`Meeting state is uncertain on ${event.platform}. Detection confidence may be low.`);
  }, [handleMeetingEnded, handleMeetingStarted]);

  useEffect(() => {
    const detectionController = createDetectionController(handleDetectionEvent);
    detectionController.start();

    const stopService = () => detectionController.stop();
    window.addEventListener('beforeunload', stopService);

    return () => {
      window.removeEventListener('beforeunload', stopService);
      detectionController.stop();
    };
  }, [handleDetectionEvent]);

  return (
    <>
      {passiveWarning ? (
        <div role="status" aria-live="polite" style={{ margin: '0 0 1rem', color: '#a66a00' }}>
          {passiveWarning}
        </div>
      ) : null}
      {statusMessage ? (
        <div role="status" aria-live="polite" style={{ margin: '0 0 1rem' }}>
          {statusMessage}
        </div>
      ) : null}
      <MeetingsFeature />
    </>
  );
}
