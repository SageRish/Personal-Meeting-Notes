import { useEffect, useMemo, useState } from 'react';
import type { MeetingDetectionEvent, MeetingPlatform } from '@meetings/core';
import { MeetingService } from '@meetings/core';
import { consentStore, type ConsentDecision } from './meeting-detection/consent-store';
import { createDetectionController } from './meeting-detection/detection-controller';
import { sessionStore, type InProgressSessionMetadata } from './meeting-detection/session-store';
import { showStartTranscriptionPrompt } from './meeting-detection/tray-notifier';

const meetingService = new MeetingService();

interface PendingPrompt {
  platform: MeetingPlatform;
  meetingId: string;
}

const platformLabel: Record<MeetingPlatform, string> = {
  teams: 'Microsoft Teams',
  zoom: 'Zoom',
};

export default function App() {
  const meetings = meetingService.getMeetings();
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt>();
  const [latestEvent, setLatestEvent] = useState<MeetingDetectionEvent>();
  const [activeSession, setActiveSession] = useState<InProgressSessionMetadata | undefined>(() => sessionStore.load());

  useEffect(() => {
    const service = createDetectionController(async (event) => {
      setLatestEvent(event);

      if (event.type === 'meeting_started' && event.meetingId) {
        const consent = consentStore.get(event.platform);
        await showStartTranscriptionPrompt(event.platform);

        if (consent !== 'granted') {
          setPendingPrompt({ platform: event.platform, meetingId: event.meetingId });
          return;
        }

        const metadata: InProgressSessionMetadata = {
          meetingId: event.meetingId,
          platform: event.platform,
          startedAt: new Date().toISOString(),
          captureConfirmed: true,
        };

        sessionStore.save(metadata);
        setActiveSession(metadata);
      }

      if (event.type === 'meeting_ended') {
        sessionStore.clear();
        setActiveSession(undefined);
        setPendingPrompt(undefined);
      }

      if (event.type === 'meeting_unknown') {
        setPendingPrompt(undefined);
      }
    });

    service.start();

    return () => {
      service.stop();
    };
  }, []);

  const consentByPlatform = useMemo<Record<MeetingPlatform, ConsentDecision>>(
    () => ({
      teams: consentStore.get('teams'),
      zoom: consentStore.get('zoom'),
    }),
    [latestEvent],
  );

  const confirmCapture = (platform: MeetingPlatform, meetingId: string, rememberChoice: boolean): void => {
    if (rememberChoice) {
      consentStore.set(platform, 'granted');
    }

    const metadata: InProgressSessionMetadata = {
      meetingId,
      platform,
      startedAt: new Date().toISOString(),
      captureConfirmed: true,
    };

    sessionStore.save(metadata);
    setActiveSession(metadata);
    setPendingPrompt(undefined);
  };

  const declineCapture = (platform: MeetingPlatform, rememberChoice: boolean): void => {
    if (rememberChoice) {
      consentStore.set(platform, 'denied');
    }

    setPendingPrompt(undefined);
  };

  return (
    <main className="app-shell">
      <header>
        <h1>Meetings</h1>
        <p className="subtitle">Capture notes and action items from every conversation.</p>
      </header>

      {pendingPrompt ? (
        <section className="meeting-card" aria-live="polite">
          <h2>{platformLabel[pendingPrompt.platform]} meeting detected</h2>
          <p>Start transcription?</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => confirmCapture(pendingPrompt.platform, pendingPrompt.meetingId, false)}>
              Start once
            </button>
            <button onClick={() => confirmCapture(pendingPrompt.platform, pendingPrompt.meetingId, true)}>
              Always allow on {platformLabel[pendingPrompt.platform]}
            </button>
            <button onClick={() => declineCapture(pendingPrompt.platform, true)}>
              Don&apos;t ask again for {platformLabel[pendingPrompt.platform]}
            </button>
          </div>
        </section>
      ) : null}

      {activeSession ? (
        <section className="meeting-card" aria-live="polite">
          <h2>Transcription session active</h2>
          <p>
            {platformLabel[activeSession.platform]} · Meeting ID {activeSession.meetingId} · Started{' '}
            {new Date(activeSession.startedAt).toLocaleTimeString()}
          </p>
          <button
            onClick={() => {
              sessionStore.clear();
              setActiveSession(undefined);
            }}
          >
            Stop capture
          </button>
        </section>
      ) : null}

      <section className="meeting-list" aria-label="Upcoming meetings">
        {meetings.map((meeting) => (
          <article key={meeting.id} className="meeting-card">
            <h2>{meeting.title}</h2>
            <p>
              {meeting.scheduledAt} · {meeting.participants.length} participants
            </p>
          </article>
        ))}
      </section>

      <section className="meeting-card" aria-label="Detector status">
        <h2>Detector status</h2>
        <p>
          Teams consent: <strong>{consentByPlatform.teams}</strong> · Zoom consent:{' '}
          <strong>{consentByPlatform.zoom}</strong>
        </p>
        <p>
          Last event: <strong>{latestEvent?.type ?? 'none'}</strong>
        </p>
      </section>
    </main>
  );
}
