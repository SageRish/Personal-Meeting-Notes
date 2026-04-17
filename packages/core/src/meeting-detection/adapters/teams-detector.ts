import type { MeetingDetectorAdapter, MeetingPresenceSnapshot, MeetingSourceUnsubscribe } from '../types.js';

export interface TeamsDetectorOptions {
  getSnapshot: () => Promise<Omit<MeetingPresenceSnapshot, 'platform' | 'observedAt'>>;
  subscribe?: (onSnapshot: (snapshot: Omit<MeetingPresenceSnapshot, 'platform' | 'observedAt'>) => void) => MeetingSourceUnsubscribe;
}

export class TeamsDetector implements MeetingDetectorAdapter {
  public readonly platform = 'teams' as const;

  public constructor(private readonly options: TeamsDetectorOptions) {}

  public async poll(): Promise<MeetingPresenceSnapshot> {
    const snapshot = await this.options.getSnapshot();
    return {
      ...snapshot,
      platform: this.platform,
      observedAt: new Date().toISOString(),
    };
  }

  public subscribe?(onSnapshot: (snapshot: MeetingPresenceSnapshot) => void): MeetingSourceUnsubscribe {
    if (!this.options.subscribe) {
      return () => undefined;
    }

    return this.options.subscribe((snapshot) => {
      onSnapshot({
        ...snapshot,
        platform: this.platform,
        observedAt: new Date().toISOString(),
      });
    });
  }
}
