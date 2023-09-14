import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { Priority, Statics } from '../statics';

export class MonitoringEvent {

  private priority: Priority;
  private title: string;
  private message: string;
  private context: {[key:string]: string};

  constructor() {
    this.priority = 'high';
    this.title = '';
    this.message = '';
    this.context = {};
  }

  /**
   * Set the title of the event
   * @param title
   */
  addTitle(title: string) {
    this.title = title;
    return this;
  }

  /**
   * Set the message of the event
   * @param message
   */
  addMessage(message: string) {
    this.message = message;
    return this;
  }

  /**
   * Add an context attribute to the event
   * @param event
   * @param value
   */
  addContext(name: string, value: string) {
    this.context[name] = value;
    return this;
  }

  /**
   * Set priorty for the monitoring event
   * @param priority
   */
  setPriority(priority: Priority) {
    this.priority = priority;
    return this;
  }

  /**
   * Send the message to the topic corresponding to the priority
   * @param client
   */
  async publishToPlatformTopic(client: SNSClient) {

    try {

      const topicArn = this.getNotificationTopic(this.priority);

      const message = JSON.stringify({
        messageType: Statics.mpaMonitoringEventMessageType,
        title: this.title,
        message: this.message,
        context: this.context,
      });
      console.info('Prepared message', message);

      // Get the topic ARN
      const publish = new PublishCommand({
        TopicArn: topicArn,
        Subject: 'MPAMonitoringEvent',
        Message: message,
      });
      console.info('Publish command:', publish)
      await client.send(publish);
      console.info('Message send!');
    } catch (error) {
      console.error('Failed to publish to platform topic', error);
      throw Error('Failed to publish to platform SNS topic');
    }

  }

  /**
   * Given an priority return the SNS topic arn of the corresponding topic.
   * @param priority
   * @returns
   */
  private getNotificationTopic(priority: Priority): string {
    let arn = undefined;
    switch (priority) {
      case 'low':
        arn = process.env.SNS_ALERTS_LOW;
        break;
      case 'medium':
        arn = process.env.SNS_ALERTS_MEDIUM;
        break;
      case 'high':
        arn = process.env.SNS_ALERTS_HIGH;
        break;
      case 'critical':
        arn = process.env.SNS_ALERTS_CRITICAL;
        break;
      default:
        arn = process.env.SNS_ALERTS_CRITICAL;
        break;
    }
    if (!arn) {
      throw new Error('No topic arn found');
    }
    return arn;
  }

}