import { APIGatewayProxyEvent } from 'aws-lambda';
import { TrackedSlackMessage } from '../shared/models/TrackedSlackMessage';

export class TrackedSlackMessageParser {

  static parse(event: APIGatewayProxyEvent): TrackedSlackMessage {
    const body = JSON.parse(event.body ?? '{}');

    const slackEvent = body.event;
    if (!slackEvent || slackEvent.type !== 'app_mention') {
      throw new Error('Not a valid app_mention event');
    }

    const text = slackEvent.text;
    const threadId = slackEvent.thread_ts || slackEvent.ts;
    const messageId = slackEvent.client_msg_id || slackEvent.event_ts;
    const channelId = slackEvent.channel;

    if (!text || !threadId || !messageId || !channelId) {
      throw new Error('Required fields missing in slack event');
    }

    const trackingGoal = this.getTrackingGoal(text);
    if (!trackingGoal) {
      throw new Error('Could not determine tracking goal from message');
    }

    return {
      messageId,
      timestamp: new Date(),
      trackingGoal,
      threadId,
      channelId,
    };
  }

  private static getTrackingGoal(text: string): 'audit' | 'incident' {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('audit')) {
      return 'audit';
    }
    if (lowerText.includes('incident')) {
      return 'incident';
    }
    throw Error(`Unknown tracking goal: ${text}`);
  }

}