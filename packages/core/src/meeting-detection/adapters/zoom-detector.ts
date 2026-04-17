import { createHash } from 'node:crypto';

import type { MeetingDetectorAdapter, MeetingPresenceSnapshot, MeetingSourceUnsubscribe } from '../types.js';

export interface ZoomSignal {
  processName?: string;
  windowTitle?: string;
  sessionId?: string;
  meetingUrl?: string;
  callStatus?: 'in_meeting' | 'idle';
  pid?: number;
  startedAt?: string;
}

export interface ZoomDetectorOptions {
  signalSource?: () => Promise<ZoomSignal[]>;
  subscribe?: (onSignal: (signals: ZoomSignal[]) => void) => MeetingSourceUnsubscribe;
  now?: () => Date;
}

const ZOOM_PROCESS_PATTERNS = ['zoom.us', 'zoom'];
const ACTIVE_TITLE_PATTERNS = ['zoom meeting', 'in meeting', 'sharing'];
const MEETING_URL_PATTERN = /zoom\.us\/(?:j|wc)\//i;

export class ZoomDetector implements MeetingDetectorAdapter {
  public readonly platform = 'zoom' as const;

  public constructor(private readonly options: ZoomDetectorOptions = {}) {}

  public async poll(): Promise<MeetingPresenceSnapshot> {
    const signals = await this.readSignals();
    return this.toSnapshot(signals);
  }

  public subscribe?(onSnapshot: (snapshot: MeetingPresenceSnapshot) => void): MeetingSourceUnsubscribe {
    if (!this.options.subscribe) {
      return () => undefined;
    }

    return this.options.subscribe((signals) => {
      onSnapshot(this.toSnapshot(signals));
    });
  }

  private async readSignals(): Promise<ZoomSignal[]> {
    if (this.options.signalSource) {
      return this.options.signalSource();
    }

    return defaultZoomSignalSource();
  }

  private toSnapshot(signals: ZoomSignal[]): MeetingPresenceSnapshot {
    const observedAt = this.now().toISOString();
    const candidates = signals.filter((signal) => this.looksLikeZoom(signal));

    if (candidates.length === 0) {
      return {
        platform: this.platform,
        state: 'inactive',
        confidence: 1,
        observedAt,
      };
    }

    const activeCandidate = candidates.find((signal) => this.isActiveCall(signal));
    if (activeCandidate) {
      return {
        platform: this.platform,
        state: 'active',
        meetingId: this.stableMeetingId(activeCandidate),
        confidence: this.confidenceFor(signalEvidence(activeCandidate)),
        observedAt,
      };
    }

    return {
      platform: this.platform,
      state: 'unknown',
      confidence: 0.4,
      observedAt,
    };
  }

  private looksLikeZoom(signal: ZoomSignal): boolean {
    const processName = signal.processName?.toLowerCase() ?? '';
    const windowTitle = signal.windowTitle?.toLowerCase() ?? '';
    return ZOOM_PROCESS_PATTERNS.some((pattern) => processName.includes(pattern)) || windowTitle.includes('zoom');
  }

  private isActiveCall(signal: ZoomSignal): boolean {
    if (signal.callStatus === 'in_meeting') {
      return true;
    }

    if (signal.meetingUrl && MEETING_URL_PATTERN.test(signal.meetingUrl)) {
      return true;
    }

    const title = signal.windowTitle?.toLowerCase() ?? '';
    return ACTIVE_TITLE_PATTERNS.some((pattern) => title.includes(pattern));
  }

  private stableMeetingId(signal: ZoomSignal): string {
    const seed = [
      signal.sessionId,
      signal.meetingUrl,
      signal.pid !== undefined ? String(signal.pid) : undefined,
      signal.startedAt,
      signal.windowTitle,
    ]
      .filter((value): value is string => Boolean(value))
      .join('|');

    const digest = createHash('sha1').update(seed || 'zoom-active-session').digest('hex');
    return `zoom-${digest.slice(0, 16)}`;
  }

  private confidenceFor(evidence: number): number {
    if (evidence >= 3) {
      return 0.95;
    }

    if (evidence === 2) {
      return 0.84;
    }

    return 0.68;
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

function signalEvidence(signal: ZoomSignal): number {
  let evidence = 0;
  if (signal.sessionId) {
    evidence += 1;
  }

  if (signal.meetingUrl && MEETING_URL_PATTERN.test(signal.meetingUrl)) {
    evidence += 1;
  }

  if (signal.callStatus === 'in_meeting') {
    evidence += 1;
  }

  if (signal.windowTitle?.toLowerCase().includes('meeting')) {
    evidence += 1;
  }

  return evidence;
}

async function defaultZoomSignalSource(): Promise<ZoomSignal[]> {
  if (typeof process === 'undefined' || !process.platform) {
    return [];
  }

  if (process.platform === 'win32') {
    return windowsSignalsForZoom();
  }

  return posixSignalsForZoom();
}

async function windowsSignalsForZoom(): Promise<ZoomSignal[]> {
  const command =
    "Get-CimInstance Win32_Process | Where-Object {$_.Name -match 'zoom'} | Select-Object ProcessId,Name,CommandLine,CreationDate | ConvertTo-Json -Compress";

  const raw = await execCommand('powershell', ['-NoProfile', '-Command', command]);
  if (!raw) {
    return [];
  }

  const parsed = parseJsonArray<Record<string, unknown>>(raw);
  return parsed.map((entry) => ({
    processName: asString(entry.Name),
    pid: asNumber(entry.ProcessId),
    startedAt: asString(entry.CreationDate),
    meetingUrl: extractMeetingUrl(asString(entry.CommandLine)),
    windowTitle: asString(entry.CommandLine),
  }));
}

async function posixSignalsForZoom(): Promise<ZoomSignal[]> {
  const raw = await execCommand('ps', ['-axo', 'pid,lstart,comm,args']);
  if (!raw) {
    return [];
  }

  return raw
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = line.match(/^(\d+)\s+([A-Za-z]{3}\s+[A-Za-z]{3}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(\S+)\s+(.*)$/);
      if (!match) {
        return undefined;
      }

      const [, pid, startedAt, processName, args] = match;
      return {
        pid: Number(pid),
        startedAt,
        processName,
        meetingUrl: extractMeetingUrl(args),
        windowTitle: args,
      } as ZoomSignal;
    })
    .filter((signal): signal is ZoomSignal => signal !== undefined);
}

function extractMeetingUrl(input: string | undefined): string | undefined {
  if (!input) {
    return undefined;
  }

  const match = input.match(/https?:\/\/\S+/i);
  return match?.[0];
}

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed as T[];
    }

    if (parsed && typeof parsed === 'object') {
      return [parsed as T];
    }

    return [];
  } catch {
    return [];
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

async function execCommand(command: string, args: string[]): Promise<string> {
  try {
    const { execFile } = await import('node:child_process');
    return await new Promise<string>((resolve) => {
      execFile(command, args, { timeout: 1_500, windowsHide: true }, (error, stdout) => {
        if (error) {
          resolve('');
          return;
        }

        resolve(stdout.trim());
      });
    });
  } catch {
    return '';
  }
}
