const SLACK_API = 'https://slack.com/api';

export class SlackApi {
  static async respond(responseUrl: string, body: object): Promise<void> {
    const response = await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Slack response_url failed: HTTP ${response.status}`);
    }
  }

  private readonly botToken: string;

  constructor(botToken: string) {
    this.botToken = botToken;
  }

  async openModal(triggerId: string, view: object): Promise<void> {
    const response = await fetch(`${SLACK_API}/views.open`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ trigger_id: triggerId, view }),
    });
    await this.check('views.open', response);
  }

  async listGroupMembers(userGroupId: string): Promise<string[]> {
    const params = new URLSearchParams({ usergroup: userGroupId });
    const response = await fetch(`${SLACK_API}/usergroups.users.list?${params}`, {
      headers: this.headers(),
    });
    const json = await this.check('usergroups.users.list', response);
    return json.users ?? [];
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.botToken}`,
      'Content-Type': 'application/json',
    };
  }

  private async check(method: string, response: Response): Promise<any> {
    if (!response.ok) {
      throw new Error(`Slack ${method} failed: HTTP ${response.status}`);
    }
    const json = await response.json() as any;
    if (!json.ok) {
      throw new Error(`Slack ${method} failed: ${json.error}`);
    }
    return json;
  }
}
