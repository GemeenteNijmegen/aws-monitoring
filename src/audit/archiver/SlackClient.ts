import { SlackMessage, SlackThread } from './models/ArchivedThread';

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

  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  async getThread(channelId: string, threadTs: string): Promise<SlackThread> {
    const params = new URLSearchParams({
      channel: channelId,
      ts: threadTs,
      inclusive: 'true',
    });
    const response = await fetch(`https://slack.com/api/conversations.replies?${params}`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.statusText}`);
    }

    const json = await response.json() as any;

    const messages: SlackMessage[] = json.messages.map((msg: any) => ({
      ts: msg.ts,
      user: msg.user || msg.bot_id || 'unknown',
      text: msg.text || '',
      type: msg.type,
      subtype: msg.subtype,
    }));

    return {
      threadId: threadTs,
      messages,
      lastUpdated: new Date(),
    };
  }

}