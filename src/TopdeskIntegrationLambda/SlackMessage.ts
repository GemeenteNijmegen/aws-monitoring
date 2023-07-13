import axios from 'axios';

const MAX_HEADER_LENGTH = 151;
const MAX_SECTION_LENGTH = 3000;

// TODO combine with SlackMessage from other lambda (different send method)
export class SlackMessage {

  static fromPayload(payload: any) {
    const msg = new SlackMessage();
    msg.blocks = payload.message.blocks;
    msg.responseUrl = payload.response_url;
    msg.additionalOptions = {
      replace_original: true,
    };
    return msg;
  }

  private additionalOptions = {};
  private blocks: any[] = [];
  private responseUrl: string = '';

  removeAllInteractionBlocks() {
    this.blocks = this.blocks.filter(block => {
      const isActions = block.type == 'actions';
      const hasElements = block.elements?.length > 0;
      const hasActionId = hasElements ? block.elements[0].action_id == 'create-topdesk-ticket' : false;
      return !(isActions && hasElements && hasActionId);
    });
    return this;
  }

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

  getSlackMessage() {
    return {
      blocks: this.blocks,
      ...this.additionalOptions,
    };
  }

  /**
   * Use axios to send a message to Slack
   *
   * @returns axios response
   */
  async send() {
    if (!this.responseUrl) {
      throw Error('No response url found in payload');
    }
    const message = this.getSlackMessage();
    return axios.post(this.responseUrl, message);
  }

}

