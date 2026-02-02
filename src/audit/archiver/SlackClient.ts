import { SlackMessage, SlackThread, SlackUser } from './models/ArchivedThread';

export class SlackClient {

  static extractChannelAndThread(slackThreadId: string): { channelId: string; threadTs: string } {
    // Assuming slackThreadId format is "channelId:threadTs" or just threadTs
    const parts = slackThreadId.split(':');
    if (parts.length === 2) {
      return { channelId: parts[0], threadTs: parts[1] };
    }
    // If no channel specified, we'll need to get it from environment or config
    return { channelId: process.env.DEFAULT_SLACK_CHANNEL || '', threadTs: slackThreadId };
  }

  private readonly botToken: string;

  constructor(botToken: string) {
    this.botToken = botToken;
  }

  async getThread(channelId: string, threadTs: string): Promise<SlackThread> {
    const params = new URLSearchParams({
      channel: channelId,
      ts: threadTs,
      inclusive: 'true',
    });
    const response = await fetch(`https://slack.com/api/conversations.replies?${params}`, {
      headers: {
        'Authorization': `Bearer ${this.botToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.statusText}`);
    }

    const json = await response.json() as any;

    if (!json.ok) {
      const errorMessage = json.error;
      throw new Error(`Slack API error: ${errorMessage}`);
    }

    const messages: SlackMessage[] = json.messages.map((msg: any) => {
      return {
        ts: msg.ts,
        user: msg.user || msg.bot_id,
        text: msg.text || '',
        type: msg.type,
        subtype: msg.subtype,
        files: msg.files?.map((file: any) => ({
          id: file.id,
          name: file.name,
          mimetype: file.mimetype,
          url_private: file.url_private,
          url_private_download: file.url_private_download,
        })),
      };
    });

    return {
      threadId: threadTs,
      messages,
      lastUpdated: new Date(),
    };
  }

  async downloadFile(url: string): Promise<Buffer> {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.botToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async postMessage(channelId: string, threadTs: string, text: string): Promise<void> {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        thread_ts: threadTs,
        text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send Slack message: ${response.statusText}`);
    }

    const json = await response.json() as any;
    if (!json.ok) {
      throw new Error(`Slack API error: ${json.error}`);
    }
  }

  async getUsers(): Promise<SlackUser[]> {
    const response = await fetch('https://slack.com/api/users.list', {
      headers: {
        'Authorization': `Bearer ${this.botToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.statusText}`);
    }

    const json = await response.json() as any;

    if (!json.ok) {
      const errorMessage = json.error;
      throw new Error(`Slack API error: ${errorMessage}`);
    }

    const users: SlackUser[] = json.members.map((member: any) => {
      return {
        id: member.id,
        name: member.name,
      };
    });

    return users;

  }

}