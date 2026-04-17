import { useMemo, useState } from 'react';

type MeetingPlatform = 'Zoom' | 'Teams' | 'Google Meet';
type MeetingStatus = 'Scheduled' | 'Completed' | 'Canceled';
type MeetingTab = 'Summary' | 'Notes' | 'Transcript';

interface TranscriptLine {
  time: string;
  speaker: string;
  text: string;
}

interface ActionItem {
  id: string;
  text: string;
}

interface Meeting {
  id: string;
  title: string;
  platform: MeetingPlatform;
  status: MeetingStatus;
  date: string;
  startTime: string;
  endTime: string;
  attendees: string[];
  summary: string;
  notes: string;
  actionItems: ActionItem[];
  transcript: TranscriptLine[];
}

const MEETINGS: Meeting[] = [
  {
    id: 'm-1001',
    title: 'Product Weekly Standup',
    platform: 'Zoom',
    status: 'Scheduled',
    date: '2026-04-18',
    startTime: '09:00',
    endTime: '09:30',
    attendees: ['Alex', 'Rina', 'Sam', 'Morgan'],
    summary:
      'Plan priorities for next sprint: release notes polish, onboarding flow fixes, and customer pilot handoff.',
    notes:
      'Discuss blockers from design review and API rate limit issue. Need to align release timeline with marketing launch.',
    actionItems: [
      { id: 'a1', text: 'Finalize onboarding copy before Monday.' },
      { id: 'a2', text: 'Share API limits dashboard with support team.' },
      { id: 'a3', text: 'Confirm launch date with marketing.' },
    ],
    transcript: [
      { time: '00:02', speaker: 'Alex', text: 'Let’s start with wins from last week and any blockers.' },
      { time: '00:54', speaker: 'Rina', text: 'Onboarding improvements are ready for QA on Friday.' },
      { time: '02:17', speaker: 'Sam', text: 'Rate limiting is still causing retries for enterprise accounts.' },
      { time: '03:48', speaker: 'Morgan', text: 'I can coordinate with support for customer messaging.' },
    ],
  },
  {
    id: 'm-1002',
    title: 'Customer Onboarding Retrospective',
    platform: 'Teams',
    status: 'Completed',
    date: '2026-04-16',
    startTime: '14:00',
    endTime: '15:00',
    attendees: ['Dana', 'Priya', 'Jules'],
    summary: 'Reviewed onboarding friction points and identified top three workflow improvements.',
    notes:
      'Customers struggle with permissions setup. Add setup checklist and in-product hints. Follow up on billing messaging.',
    actionItems: [
      { id: 'a4', text: 'Draft onboarding checklist in docs.' },
      { id: 'a5', text: 'Prototype inline permission hints.' },
    ],
    transcript: [
      { time: '00:11', speaker: 'Dana', text: 'Feedback quality was high from pilot account admins.' },
      { time: '01:21', speaker: 'Priya', text: 'The first-time setup still takes more than ten minutes.' },
      { time: '02:36', speaker: 'Jules', text: 'We should simplify the billing terms before renewal.' },
    ],
  },
  {
    id: 'm-1003',
    title: 'Engineering Leadership Sync',
    platform: 'Google Meet',
    status: 'Completed',
    date: '2026-04-15',
    startTime: '11:00',
    endTime: '12:00',
    attendees: ['Nia', 'Chris', 'Lee', 'Terry'],
    summary: 'Aligned on reliability milestones and staffing plans for Q3.',
    notes: 'Need RFC for incident response ownership model and SLO dashboard rollout.',
    actionItems: [
      { id: 'a6', text: 'Create incident response ownership RFC.' },
      { id: 'a7', text: 'Publish SLO dashboard draft for review.' },
    ],
    transcript: [
      { time: '00:07', speaker: 'Nia', text: 'Staffing request for platform team is now approved.' },
      { time: '01:15', speaker: 'Chris', text: 'We need clearer handoffs for incident command.' },
      { time: '02:59', speaker: 'Lee', text: 'SLO dashboard will be shared with leadership this week.' },
    ],
  },
  {
    id: 'm-1004',
    title: 'Design Critique - Notes Experience',
    platform: 'Zoom',
    status: 'Canceled',
    date: '2026-04-14',
    startTime: '16:00',
    endTime: '16:45',
    attendees: ['Vera', 'Nikhil', 'Sasha'],
    summary: 'Session canceled due to scheduling conflict.',
    notes: 'Rebook for next week once updated prototypes are ready.',
    actionItems: [{ id: 'a8', text: 'Reschedule critique with refreshed wireframes.' }],
    transcript: [{ time: '00:00', speaker: 'System', text: 'No transcript available.' }],
  },
];

const STATUS_TONE: Record<MeetingStatus, 'success' | 'warning' | 'danger'> = {
  Scheduled: 'warning',
  Completed: 'success',
  Canceled: 'danger',
};

const dateFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const dateGroupFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

function loadChecklistState() {
  try {
    const raw = window.localStorage.getItem('meeting-action-checks');
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function MeetingsFeature() {
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState<'All' | MeetingPlatform>('All');
  const [status, setStatus] = useState<'All' | MeetingStatus>('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const sortedMeetings = useMemo(() => [...MEETINGS].sort((a, b) => (a.date < b.date ? 1 : -1)), []);

  const filteredMeetings = useMemo(() => {
    return sortedMeetings.filter((meeting) => {
      const query = search.trim().toLowerCase();
      const matchesSearch =
        query.length === 0 ||
        meeting.title.toLowerCase().includes(query) ||
        meeting.attendees.join(' ').toLowerCase().includes(query);

      const matchesPlatform = platform === 'All' || meeting.platform === platform;
      const matchesStatus = status === 'All' || meeting.status === status;
      const matchesStartDate = startDate.length === 0 || meeting.date >= startDate;
      const matchesEndDate = endDate.length === 0 || meeting.date <= endDate;

      return matchesSearch && matchesPlatform && matchesStatus && matchesStartDate && matchesEndDate;
    });
  }, [endDate, platform, search, sortedMeetings, startDate, status]);

  const upcomingMeetings = useMemo(
    () => filteredMeetings.filter((meeting) => meeting.status === 'Scheduled').slice(0, 3),
    [filteredMeetings],
  );

  const recentGroups = useMemo(() => {
    const groups = new Map<string, Meeting[]>();

    filteredMeetings
      .filter((meeting) => meeting.status !== 'Scheduled')
      .forEach((meeting) => {
        const existing = groups.get(meeting.date) ?? [];
        existing.push(meeting);
        groups.set(meeting.date, existing);
      });

    return [...groups.entries()];
  }, [filteredMeetings]);

  const [selectedMeetingId, setSelectedMeetingId] = useState<string>(sortedMeetings[0]?.id ?? '');
  const [activeTab, setActiveTab] = useState<MeetingTab>('Summary');
  const [checkState, setCheckState] = useState<Record<string, boolean>>(() => loadChecklistState());

  const selectedMeeting = useMemo(
    () => sortedMeetings.find((meeting) => meeting.id === selectedMeetingId) ?? sortedMeetings[0],
    [selectedMeetingId, sortedMeetings],
  );

  const [summaryDraftByMeeting, setSummaryDraftByMeeting] = useState<Record<string, string>>(() =>
    Object.fromEntries(sortedMeetings.map((meeting) => [meeting.id, meeting.summary])),
  );

  const [notesDraftByMeeting, setNotesDraftByMeeting] = useState<Record<string, string>>(() =>
    Object.fromEntries(sortedMeetings.map((meeting) => [meeting.id, meeting.notes])),
  );

  const [transcriptSearch, setTranscriptSearch] = useState('');

  const transcriptMatches = useMemo(() => {
    if (!selectedMeeting) {
      return [];
    }

    const q = transcriptSearch.trim().toLowerCase();

    return selectedMeeting.transcript.filter((line) => {
      if (q.length === 0) {
        return true;
      }

      return (
        line.text.toLowerCase().includes(q) || line.speaker.toLowerCase().includes(q) || line.time.toLowerCase().includes(q)
      );
    });
  }, [selectedMeeting, transcriptSearch]);

  const toggleActionItem = (actionItemId: string) => {
    const key = `${selectedMeeting.id}:${actionItemId}`;
    const next = { ...checkState, [key]: !checkState[key] };
    setCheckState(next);
    window.localStorage.setItem('meeting-action-checks', JSON.stringify(next));
  };

  if (!selectedMeeting) {
    return null;
  }

  return (
    <div className="meetings-page">
      <header className="page-header card" role="banner">
        <h1>Meeting Notes</h1>
        <p>Search, review, and edit meeting outcomes from one workspace.</p>
      </header>

      <main className="layout-grid" role="main">
        <section aria-labelledby="home-title" className="stack-column">
          <h2 id="home-title" className="section-title">
            Home
          </h2>

          <article className="card" aria-labelledby="filters-title">
            <h3 id="filters-title">Search & Filters</h3>
            <div className="filters-grid">
              <label>
                Search
                <input
                  type="search"
                  placeholder="Search titles or attendees"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>

              <label>
                Platform
                <select value={platform} onChange={(event) => setPlatform(event.target.value as 'All' | MeetingPlatform)}>
                  <option value="All">All platforms</option>
                  <option value="Zoom">Zoom</option>
                  <option value="Teams">Teams</option>
                  <option value="Google Meet">Google Meet</option>
                </select>
              </label>

              <label>
                Status
                <select value={status} onChange={(event) => setStatus(event.target.value as 'All' | MeetingStatus)}>
                  <option value="All">All statuses</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Completed">Completed</option>
                  <option value="Canceled">Canceled</option>
                </select>
              </label>

              <label>
                Start date
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>

              <label>
                End date
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </label>
            </div>
          </article>

          <article className="card" aria-labelledby="upcoming-title">
            <h3 id="upcoming-title">Upcoming Meetings</h3>
            <ul className="meeting-list" role="list">
              {upcomingMeetings.length > 0 ? (
                upcomingMeetings.map((meeting) => (
                  <li key={meeting.id}>
                    <button
                      className="meeting-item"
                      type="button"
                      onClick={() => setSelectedMeetingId(meeting.id)}
                      aria-current={selectedMeeting.id === meeting.id}
                    >
                      <span>
                        <strong>{meeting.title}</strong>
                        <small>
                          {dateFormat.format(new Date(meeting.date))} · {meeting.startTime}
                        </small>
                      </span>
                      <span className={`status-pill ${STATUS_TONE[meeting.status]}`}>{meeting.status}</span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="empty-state">No upcoming meetings match your filters.</li>
              )}
            </ul>
          </article>

          <article className="card" aria-labelledby="recent-title">
            <h3 id="recent-title">Recent Meetings</h3>
            {recentGroups.length === 0 ? <p className="empty-state">No recent meetings match your filters.</p> : null}
            {recentGroups.map(([date, meetings]) => (
              <section key={date} className="date-group" aria-label={dateGroupFormat.format(new Date(date))}>
                <h4>{dateGroupFormat.format(new Date(date))}</h4>
                <ul className="meeting-list" role="list">
                  {meetings.map((meeting) => (
                    <li key={meeting.id}>
                      <button
                        className="meeting-item"
                        type="button"
                        onClick={() => setSelectedMeetingId(meeting.id)}
                        aria-current={selectedMeeting.id === meeting.id}
                      >
                        <span>
                          <strong>{meeting.title}</strong>
                          <small>
                            {meeting.platform} · {meeting.startTime}–{meeting.endTime}
                          </small>
                        </span>
                        <span className={`status-pill ${STATUS_TONE[meeting.status]}`}>{meeting.status}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </article>
        </section>

        <aside className="stack-column" aria-label="Meeting detail panel">
          <section className="card detail-header" aria-labelledby="detail-title">
            <h2 id="detail-title">{selectedMeeting.title}</h2>
            <p>
              {dateFormat.format(new Date(selectedMeeting.date))} · {selectedMeeting.startTime}–{selectedMeeting.endTime} ·{' '}
              {selectedMeeting.platform}
            </p>
            <p>{selectedMeeting.attendees.join(', ')}</p>
          </section>

          <section className="card" aria-labelledby="details-tabs-heading">
            <h3 id="details-tabs-heading" className="visually-hidden">
              Meeting details
            </h3>

            <div className="tab-list" role="tablist" aria-label="Meeting detail tabs">
              {(['Summary', 'Notes', 'Transcript'] as MeetingTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  aria-controls={`panel-${tab}`}
                  id={`tab-${tab}`}
                  className="tab-button"
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            {activeTab === 'Summary' ? (
              <section id="panel-Summary" role="tabpanel" aria-labelledby="tab-Summary" className="tab-panel">
                <label>
                  Editable summary
                  <textarea
                    rows={8}
                    value={summaryDraftByMeeting[selectedMeeting.id]}
                    onChange={(event) =>
                      setSummaryDraftByMeeting((current) => ({ ...current, [selectedMeeting.id]: event.target.value }))
                    }
                  />
                </label>
              </section>
            ) : null}

            {activeTab === 'Notes' ? (
              <section id="panel-Notes" role="tabpanel" aria-labelledby="tab-Notes" className="tab-panel">
                <label>
                  Editable notes
                  <textarea
                    rows={10}
                    value={notesDraftByMeeting[selectedMeeting.id]}
                    onChange={(event) =>
                      setNotesDraftByMeeting((current) => ({ ...current, [selectedMeeting.id]: event.target.value }))
                    }
                  />
                </label>
              </section>
            ) : null}

            {activeTab === 'Transcript' ? (
              <section id="panel-Transcript" role="tabpanel" aria-labelledby="tab-Transcript" className="tab-panel">
                <label>
                  Search transcript
                  <input
                    type="search"
                    placeholder="Search by speaker, time, or phrase"
                    value={transcriptSearch}
                    onChange={(event) => setTranscriptSearch(event.target.value)}
                  />
                </label>

                <ol className="transcript-list" aria-live="polite">
                  {transcriptMatches.length > 0 ? (
                    transcriptMatches.map((line, index) => (
                      <li key={`${line.time}-${index}`}>
                        <time dateTime={line.time}>{line.time}</time>
                        <p>
                          <strong>{line.speaker}: </strong>
                          {line.text}
                        </p>
                      </li>
                    ))
                  ) : (
                    <li className="empty-state">No transcript lines match your search.</li>
                  )}
                </ol>
              </section>
            ) : null}
          </section>

          <section className="card" aria-labelledby="action-items-title">
            <h3 id="action-items-title">Action Items</h3>
            <ul className="checklist" role="list">
              {selectedMeeting.actionItems.map((item) => {
                const key = `${selectedMeeting.id}:${item.id}`;
                const checked = checkState[key] ?? false;

                return (
                  <li key={item.id}>
                    <label>
                      <input type="checkbox" checked={checked} onChange={() => toggleActionItem(item.id)} />
                      <span>{item.text}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </main>
    </div>
  );
}
