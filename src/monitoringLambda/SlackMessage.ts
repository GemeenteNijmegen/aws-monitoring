import axios from 'axios';
import { MessageProps } from './Message';

const MAX_HEADER_LENGTH = 151;
const MAX_SECTION_LENGTH = 3000;

export class SlackMessage {

  static from(message: MessageProps) {
    const slack = new SlackMessage();
    if (message.header) {
      slack.addHeader(message.header);
    }
    if (message.context) {
      slack.addContext(message.context);
    }
    if (message.sections) {
      message.sections.forEach(section => slack.addSection(section));
    }
    if (message.link) {
      slack.addLink(message.link.text, message.link.target);
    }
    return slack;
  }

  private blocks: any[] = [];

  addHeader(text: string) {
    this.blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: text.substring(0, MAX_HEADER_LENGTH -1),
        emoji: true,
      },
    });
  }

  addContext(context: { [name: string]: string }) {
    const elements = Object.entries(context).map((entry) => {
      return {
        type: 'mrkdwn',
        text: `${entry[0]}: *${entry[1]}*`,
      };
    });
    this.blocks.push({
      type: 'context',
      elements: elements,
    });
  }

  addSection(text: string) {
    if (!text || text.length > MAX_SECTION_LENGTH) {
      console.log('Message is empty or too long, max 3000', text);
      text = '(message ommited)';
    }
    this.blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: text,
      },
    });
  }

  addLink(text: string, target: string) {
    this.blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${target}|${text}>`,
      },
    });
  }

  addButton(text: string, actionName: string, payload: any) {
    const block = {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: text,
            emoji: true,
          },
          value: Buffer.from(JSON.stringify(payload)).toString('base64'),
          action_id: actionName,
        },
      ],
    };
    this.blocks.push(block);
  }

  getSlackMessage() {
    return {
      blocks: this.blocks,
    };
  }

  /**
   * Use axios to send a message to Slack
   *
   * @param message the message
   * @returns axios response
   */
  async send(priority: string) {
    let url = this.getSlackUrl(priority);
    if (!url) {
      throw Error('No slack webhook url defined');
    }
    const message = this.getSlackMessage();

    console.debug('Message:', JSON.stringify(message));
    const resp = await axios.post(url, JSON.stringify(message), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    console.log(resp);
  }

  getSlackUrl(priority: string) {
    console.debug('getting slack webhook for priority ', priority);
    if (!['low', 'medium', 'high', 'critical'].some(valid => valid == priority)) {
      console.debug('no webhook set, no known priority', priority);
      return false;
    }
    console.debug(`returning webhook SLACK_WEBHOOK_URL_${priority.toUpperCase()}`);
    return process.env?.[`SLACK_WEBHOOK_URL_${priority.toUpperCase()}`];
  }

}

