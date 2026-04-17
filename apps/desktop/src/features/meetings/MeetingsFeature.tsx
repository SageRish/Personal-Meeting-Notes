import type { MeetingDetail, MeetingListFilters, MeetingListItem, MeetingStatus, RecentMeetingGroup } from '@meetings/core';
import { useEffect, useMemo, useState } from 'react';

import { desktopPipelineRuntime } from '../../pipeline/desktop-pipeline-runtime';

type MeetingTab = 'Summary' | 'Notes' | 'Transcript';

interface TranscriptLine {
  time: string;
  speaker: string;
  text: string;
}

const STATUS_LABEL: Record<MeetingStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  processed: 'Processed',
  failed: 'Failed',
};

const STATUS_TONE: Record<MeetingStatus, 'success' | 'warning' | 'danger'> = {
  scheduled: 'warning',
  in_progress: 'warning',
  processed: 'success',
  failed: 'danger',
};

const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
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

function buildFilters({
  platform,
  status,
  startDate,
  endDate,
  query,
}: {
  platform: string;
  status: string;
  startDate: string;
  endDate: string;
  query: string;
}): MeetingListFilters {
  const filters: MeetingListFilters = {};

  if (platform !== 'All') {
    filters.platform = platform;
  }

  if (status !== 'All') {
    filters.status = status as MeetingStatus;
  }

  if (startDate) {
    filters.startDate = `${startDate}T00:00:00.000Z`;
  }

  if (endDate) {
    filters.endDate = `${endDate}T23:59:59.999Z`;
  }

  if (query.trim()) {
    filters.query = query.trim();
  }

  return filters;
}

function formatDuration(durationSeconds: number): string {
  const minutes = Math.floor(durationSeconds / 60);
  const remainderSeconds = durationSeconds % 60;

  if (remainderSeconds === 0) {
    return `${minutes} min`;
  }

  return `${minutes}m ${remainderSeconds}s`;
}

function formatTranscriptTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');

  return `${mins}:${secs}`;
}

function buildTranscriptLines(detail: MeetingDetail): TranscriptLine[] {
  const transcript = detail.transcript;

  if (!transcript) {
    return [];
  }

  return transcript.segments.map((segment, index) => ({
    time: formatTranscriptTimestamp(transcript.timestamps[index] ?? 0),
    speaker: 'Speaker',
    text: segment,
  }));
}

export function MeetingsFeature() {
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('All');
  const [status, setStatus] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [upcomingMeetings, setUpcomingMeetings] = useState<MeetingListItem[]>([]);
  const [recentGroups, setRecentGroups] = useState<RecentMeetingGroup[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState('');
  const [selectedMeetingDetail, setSelectedMeetingDetail] = useState<MeetingDetail | null>(null);
  const [activeTab, setActiveTab] = useState<MeetingTab>('Summary');
  const [checkState, setCheckState] = useState<Record<string, boolean>>(() => loadChecklistState());

  const [summaryDraft, setSummaryDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [transcriptSearch, setTranscriptSearch] = useState('');

  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    let canceled = false;

    const run = async () => {
      setLoadingLists(true);

      const filters = buildFilters({ platform, status, startDate, endDate, query: search });
      const [upcoming, grouped] = await Promise.all([
        desktopPipelineRuntime.queryUpcomingMeetings(filters, 3),
        desktopPipelineRuntime.queryRecentGroupedMeetings(filters),
      ]);

      if (canceled) {
        return;
      }

      setUpcomingMeetings(upcoming);
      setRecentGroups(grouped);

      const ids = new Set([...upcoming, ...grouped.flatMap((group) => group.meetings)].map((meeting) => meeting.id));
      if (!ids.has(selectedMeetingId)) {
        setSelectedMeetingId(upcoming[0]?.id ?? grouped[0]?.meetings[0]?.id ?? '');
      }

      setLoadingLists(false);
    };

    void run();

    return () => {
      canceled = true;
    };
  }, [endDate, platform, search, selectedMeetingId, startDate, status]);

  useEffect(() => {
    let canceled = false;

    const run = async () => {
      if (!selectedMeetingId) {
        setSelectedMeetingDetail(null);
        return;
      }

      setLoadingDetail(true);
      const detail = await desktopPipelineRuntime.queryMeetingDetail(selectedMeetingId);

      if (canceled) {
        return;
      }

      setSelectedMeetingDetail(detail);
      setSummaryDraft(detail?.summary?.editableText ?? '');
      setNotesDraft(detail?.notes?.editableMarkdown ?? '');
      setLoadingDetail(false);
    };

    void run();

    return () => {
      canceled = true;
    };
  }, [selectedMeetingId]);

  const transcriptMatches = useMemo(() => {
    if (!selectedMeetingDetail) {
      return [];
    }

    const q = transcriptSearch.trim().toLowerCase();

    return buildTranscriptLines(selectedMeetingDetail).filter((line) => {
      if (q.length === 0) {
        return true;
      }

      return line.text.toLowerCase().includes(q) || line.speaker.toLowerCase().includes(q) || line.time.toLowerCase().includes(q);
    });
  }, [selectedMeetingDetail, transcriptSearch]);

  const selectedMeeting = selectedMeetingDetail?.meeting;

  const toggleActionItem = (actionItemId: string) => {
    if (!selectedMeeting) {
      return;
    }

    const key = `${selectedMeeting.id}:${actionItemId}`;
    const next = { ...checkState, [key]: !checkState[key] };
    setCheckState(next);
    window.localStorage.setItem('meeting-action-checks', JSON.stringify(next));
  };

  if (!selectedMeeting) {
    return (
      <div className="meetings-page">
        <header className="page-header card" role="banner">
          <h1>Meeting Notes</h1>
          <p>Search, review, and edit meeting outcomes from one workspace.</p>
        </header>
        <main className="layout-grid" role="main">
          <section className="card">{loadingLists ? 'Loading meetings…' : 'No meetings found in repository yet.'}</section>
        </main>
      </div>
    );
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
                <input type="search" placeholder="Search titles or notes" value={search} onChange={(event) => setSearch(event.target.value)} />
              </label>

              <label>
                Platform
                <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
                  <option value="All">All platforms</option>
                  <option value="zoom">Zoom</option>
                  <option value="teams">Teams</option>
                  <option value="google_meet">Google Meet</option>
                </select>
              </label>

              <label>
                Status
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="All">All statuses</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In Progress</option>
                  <option value="processed">Processed</option>
                  <option value="failed">Failed</option>
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
                        <small>{dateTimeFormat.format(new Date(meeting.datetime))}</small>
                      </span>
                      <span className={`status-pill ${STATUS_TONE[meeting.status]}`}>{STATUS_LABEL[meeting.status]}</span>
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
            {recentGroups.map((group) => (
              <section key={group.date} className="date-group" aria-label={dateGroupFormat.format(new Date(group.date))}>
                <h4>{dateGroupFormat.format(new Date(group.date))}</h4>
                <ul className="meeting-list" role="list">
                  {group.meetings.map((meeting) => (
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
                            {meeting.platform} · {formatDuration(meeting.duration)}
                          </small>
                        </span>
                        <span className={`status-pill ${STATUS_TONE[meeting.status]}`}>{STATUS_LABEL[meeting.status]}</span>
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
            <p>{dateTimeFormat.format(new Date(selectedMeeting.datetime))}</p>
            <p>
              {selectedMeeting.platform} · {formatDuration(selectedMeeting.duration)} · {STATUS_LABEL[selectedMeeting.status]}
            </p>
            <p>Transcript: {selectedMeeting.transcriptAvailable ? 'Available' : 'Not available'}</p>
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
                  <textarea rows={8} value={summaryDraft} onChange={(event) => setSummaryDraft(event.target.value)} />
                </label>
              </section>
            ) : null}

            {activeTab === 'Notes' ? (
              <section id="panel-Notes" role="tabpanel" aria-labelledby="tab-Notes" className="tab-panel">
                <label>
                  Editable notes
                  <textarea rows={10} value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} />
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
              {(selectedMeetingDetail?.actionItems ?? []).map((item) => {
                const itemId = String(item.id ?? item.orderIndex);
                const key = `${selectedMeeting.id}:${itemId}`;
                const checked = checkState[key] ?? item.checked;

                return (
                  <li key={itemId}>
                    <label>
                      <input type="checkbox" checked={checked} onChange={() => toggleActionItem(itemId)} />
                      <span>{item.text}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {loadingDetail ? <p className="empty-state">Loading details…</p> : null}
          </section>
        </aside>
      </main>
    </div>
  );
}
