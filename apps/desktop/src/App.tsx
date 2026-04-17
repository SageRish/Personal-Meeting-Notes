import type { MeetingDetectionEvent } from '@meetings/core';
import { useCallback, useEffect, useState } from 'react';
import { MeetingsFeature } from './features/meetings/MeetingsFeature';
import { consentStore } from './meeting-detection/consent-store';
import { createDetectionController } from './meeting-detection/detection-controller';
import { sessionStore } from './meeting-detection/session-store';
import { showStartTranscriptionPrompt } from './meeting-detection/tray-notifier';

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

  const handleMeetingStarted = useCallback(async (event: MeetingDetectionEvent): Promise<void> => {
    const meetingId = event.meetingId ?? `detected-${event.platform}-${event.at}`;
    const existingSession = sessionStore.load(event.platform, meetingId);
    if (existingSession?.captureConfirmed) {
      return;
    }

    const granted = await promptForTranscription({ ...event, meetingId });
    sessionStore.save({
      meetingId,
      platform: event.platform,
      startedAt: event.at,
      captureConfirmed: granted,
    });

    setPassiveWarning(undefined);
    setStatusMessage(granted ? 'Transcription session started.' : 'Transcription was not started.');
  }, [promptForTranscription]);

  const handleMeetingEnded = useCallback((event: MeetingDetectionEvent): void => {
    if (!event.meetingId) {
      setStatusMessage('Meeting ended; no meeting id was available to finalize processing.');
      return;
    }

    const session = sessionStore.load(event.platform, event.meetingId);
    if (session?.captureConfirmed) {
      setStatusMessage(`Meeting ended. Finalizing pipeline run for ${event.platform}.`);
    } else {
      setStatusMessage('Meeting ended without an active transcription session.');
    }

    sessionStore.clear(event.platform, event.meetingId);
  }, []);

  const handleDetectionEvent = useCallback((event: MeetingDetectionEvent): void => {
    if (event.type === 'meeting_started') {
      void handleMeetingStarted(event);
      return;
    }

    if (event.type === 'meeting_ended') {
      handleMeetingEnded(event);
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
