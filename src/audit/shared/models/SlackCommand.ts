export interface SlackCommand {
  messageId: string;
  timestamp: Date;
  commandType: 'audit' | 'incident';
  threadId: string;
}

export interface SlackCommandData {
  messageId: string;
  timestamp: string;
  commandType: 'audit' | 'incident';
  threadId: string;
  expiresAt: number;
}