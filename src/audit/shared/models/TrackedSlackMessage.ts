export interface TrackedSlackMessage {
  messageId: string;
  timestamp: Date;
  trackingGoal: 'audit' | 'incident';
  threadId: string;
  channelId: string;
}

export interface TrackedSlackMessageData {
  messageId: string;
  timestamp: string;
  trackingGoal: 'audit' | 'incident';
  threadId: string;
  channelId: string;
  expiresAt: number;
}