import type {
  MeetingDetectionEvent,
  MeetingDetectorAdapter,
  MeetingPlatform,
  MeetingPresenceSnapshot,
  MeetingSourceUnsubscribe,
  MeetingState,
} from './types.js';

export interface BackgroundMeetingDetectionServiceOptions {
  adapters: MeetingDetectorAdapter[];
  pollingIntervalMs?: number;
  onEvent?: (event: MeetingDetectionEvent) => void;
}

interface PlatformTracker {
  currentState: MeetingState;
  meetingId: string | undefined;
  unsubscribeFns: MeetingSourceUnsubscribe[];
}

export class BackgroundMeetingDetectionService {
  private readonly trackers = new Map<MeetingPlatform, PlatformTracker>();
  private timer: ReturnType<typeof setInterval> | undefined;

  public constructor(private readonly options: BackgroundMeetingDetectionServiceOptions) {
    for (const adapter of options.adapters) {
      this.trackers.set(adapter.platform, {
        currentState: 'inactive',
        meetingId: undefined,
        unsubscribeFns: [],
      });
    }
  }

  public start(): void {
    this.attachSubscriptions();
    void this.pollAllAdapters();

    const intervalMs = this.options.pollingIntervalMs ?? 5_000;
    this.timer = setInterval(() => {
      void this.pollAllAdapters();
    }, intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    for (const tracker of this.trackers.values()) {
      tracker.unsubscribeFns.forEach((unsubscribe) => unsubscribe());
      tracker.unsubscribeFns = [];
      tracker.currentState = 'inactive';
      tracker.meetingId = undefined;
    }
  }

  private attachSubscriptions(): void {
    for (const adapter of this.options.adapters) {
      if (!adapter.subscribe) {
        continue;
      }

      const unsubscribe = adapter.subscribe((snapshot) => {
        this.processSnapshot(snapshot);
      });

      this.trackers.get(adapter.platform)?.unsubscribeFns.push(unsubscribe);
    }
  }

  private async pollAllAdapters(): Promise<void> {
    await Promise.all(
      this.options.adapters.map(async (adapter) => {
        const snapshot = await adapter.poll();
        this.processSnapshot(snapshot);
      }),
    );
  }

  private processSnapshot(snapshot: MeetingPresenceSnapshot): void {
    const tracker = this.trackers.get(snapshot.platform);
    if (!tracker) {
      return;
    }

    const nextState = snapshot.state;
    const previousState = tracker.currentState;
    const previousMeetingId = tracker.meetingId;

    tracker.currentState = nextState;
    tracker.meetingId = snapshot.meetingId;

    if (nextState === 'unknown') {
      this.emit(this.eventWithOptionals('meeting_unknown', snapshot.platform, snapshot.observedAt, snapshot));
      return;
    }

    if (nextState === 'active' && previousState !== 'active') {
      this.emit(this.eventWithOptionals('meeting_started', snapshot.platform, snapshot.observedAt, snapshot));
      return;
    }

    if (nextState === 'inactive' && previousState === 'active') {
      this.emit(
        this.eventWithOptionals('meeting_ended', snapshot.platform, snapshot.observedAt, {
          ...snapshot,
          meetingId: previousMeetingId,
        }),
      );
    }
  }

  private eventWithOptionals(
    type: MeetingDetectionEvent['type'],
    platform: MeetingPlatform,
    at: string,
    snapshot: Pick<MeetingPresenceSnapshot, 'meetingId' | 'confidence'>,
  ): MeetingDetectionEvent {
    return {
      type,
      platform,
      at,
      ...(snapshot.meetingId ? { meetingId: snapshot.meetingId } : {}),
      ...(snapshot.confidence !== undefined ? { confidence: snapshot.confidence } : {}),
    };
  }

  private emit(event: MeetingDetectionEvent): void {
    this.options.onEvent?.(event);
  }
}
