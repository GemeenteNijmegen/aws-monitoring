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
  files?: SlackFile[];
}

export interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  url_private: string;
  url_private_download: string;
  s3Key?: string;
}

export interface SlackUser {
  id: string;
  name: string;
}

export interface ArchivedThread {
  commandId: string;
  threadId: string;
  messageHashes: string[];
  lastArchived: Date;
  s3Key: string;
}