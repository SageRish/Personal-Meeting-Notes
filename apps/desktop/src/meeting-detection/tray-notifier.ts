import type { MeetingPlatform } from '@meetings/core';

const titleByPlatform: Record<MeetingPlatform, string> = {
  teams: 'Microsoft Teams meeting detected',
  zoom: 'Zoom meeting detected',
};

export async function showStartTranscriptionPrompt(platform: MeetingPlatform): Promise<void> {
  if (!('Notification' in window)) {
    return;
  }

  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }

  if (Notification.permission === 'granted') {
    new Notification(titleByPlatform[platform], {
      body: 'Start transcription?',
      silent: true,
    });
  }
}
