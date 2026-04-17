import { MeetingService } from '@meetings/core';

const meetingService = new MeetingService();

export default function App() {
  const meetings = meetingService.getMeetings();

  return (
    <main className="app-shell">
      <header>
        <h1>Meetings</h1>
        <p className="subtitle">Capture notes and action items from every conversation.</p>
      </header>

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
    </main>
  );
}
