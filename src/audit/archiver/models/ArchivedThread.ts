export interface SlackThread {
  threadId: string;
  messages: SlackMessage[];
  lastUpdated: Date;
}

export interface SlackMessage {
  ts: string;
  user: string;
  text: string;
  type: string;
  subtype?: string;
}

export interface ArchivedThread {
  commandId: string;
  threadId: string;
  messageHashes: string[];
  lastArchived: Date;
  s3Key: string;
}