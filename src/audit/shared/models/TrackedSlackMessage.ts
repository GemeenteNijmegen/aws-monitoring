export interface TrackedSlackMessage {
  messageId: string;
  timestamp: Date;
  trackingGoal: 'audit' | 'incident';
  threadId: string;
}

export interface TrackedSlackMessageData {
  messageId: string;
  timestamp: string;
  trackingGoal: 'audit' | 'incident';
  threadId: string;
  expiresAt: number;
}