import axios from 'axios';

const MAX_HEADER_LENGTH = 151;
const MAX_SECTION_LENGTH = 3000;

export class SlackMessage {

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
        text: `[${text}](${target})`,
      },
    });
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
    return axios.post(url, message);
  }

  getSlackUrl(priority: string) {
    switch (priority) {
      case 'low':
        return process.env?.SLACK_WEBHOOK_URL_LOW_PRIO;
      case 'avg':
      case 'high':
      default:
        return process.env?.SLACK_WEBHOOK_URL;
    }
  }

}

