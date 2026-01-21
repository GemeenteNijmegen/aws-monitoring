export class SlackThreadResponse {
  constructor(
    private readonly threadId: string,
    private readonly message: string,
  ) { }

  getResponse() {
    return {
      response_type: 'in_channel',
      thread_ts: this.threadId,
      text: this.message,
    };
  }

  getResponseAsString() {
    return JSON.stringify(this.getResponse());
  }
}