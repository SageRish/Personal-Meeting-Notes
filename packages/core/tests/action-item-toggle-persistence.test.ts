import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { StorageDatabase } from '../src/storage/database.js';
import { PersistenceRepository } from '../src/storage/repository.js';

function makeRepository(): { repository: PersistenceRepository; storage: StorageDatabase; dispose: () => void } {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'meeting-notes-toggle-'));
  const storage = new StorageDatabase({ dbPath: join(tempDirectory, 'toggle.sqlite') });
  const repository = new PersistenceRepository(storage.connection);

  repository.upsertMeeting({
    id: 'm-toggle',
    title: 'Toggle Test',
    datetime: '2026-04-17T00:00:00.000Z',
    platform: 'zoom',
    duration: 600,
    status: 'processed',
    transcriptAvailable: true,
  });

  return {
    repository,
    storage,
    dispose: () => {
      storage.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    },
  };
}

describe('action item toggle persistence', () => {
  const disposers: Array<() => void> = [];

  afterEach(() => {
    while (disposers.length > 0) {
      disposers.pop()?.();
    }
  });

  it('persists checked state changes when items are replaced', () => {
    const { repository, storage, dispose } = makeRepository();
    disposers.push(dispose);

    repository.replaceActionItems('m-toggle', [
      { meetingId: 'm-toggle', text: 'Draft recap', checked: false, orderIndex: 0 },
      { meetingId: 'm-toggle', text: 'Send recap', checked: false, orderIndex: 1 },
    ]);

    repository.replaceActionItems('m-toggle', [
      { meetingId: 'm-toggle', text: 'Draft recap', checked: true, orderIndex: 0 },
      { meetingId: 'm-toggle', text: 'Send recap', checked: false, orderIndex: 1 },
    ]);

    const rows = storage.connection
      .prepare('SELECT text, checked, order_index FROM action_items WHERE meeting_id = ? ORDER BY order_index ASC')
      .all('m-toggle') as Array<{ text: string; checked: number; order_index: number }>;

    expect(rows).toEqual([
      { text: 'Draft recap', checked: 1, order_index: 0 },
      { text: 'Send recap', checked: 0, order_index: 1 },
    ]);
  });

  it('persists checked state changes with partial action item updates', () => {
    const { repository, storage, dispose } = makeRepository();
    disposers.push(dispose);

    repository.replaceActionItems('m-toggle', [
      { meetingId: 'm-toggle', text: 'Draft recap', checked: false, orderIndex: 0 },
      { meetingId: 'm-toggle', text: 'Send recap', checked: false, orderIndex: 1 },
    ]);

    const firstItemId = storage.connection
      .prepare('SELECT id FROM action_items WHERE meeting_id = ? AND order_index = 0')
      .get('m-toggle') as { id: number };

    repository.updateActionItemChecked('m-toggle', firstItemId.id, true);

    const rows = storage.connection
      .prepare('SELECT text, checked, order_index FROM action_items WHERE meeting_id = ? ORDER BY order_index ASC')
      .all('m-toggle') as Array<{ text: string; checked: number; order_index: number }>;

    expect(rows).toEqual([
      { text: 'Draft recap', checked: 1, order_index: 0 },
      { text: 'Send recap', checked: 0, order_index: 1 },
    ]);
  });
});
