export class SlackThreadResponse {
  constructor(
    private readonly botToken: string,
  ) { }

  async send(channelId: string, threadTs: string, message: string): Promise<void> {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        thread_ts: threadTs,
        text: message,
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
}