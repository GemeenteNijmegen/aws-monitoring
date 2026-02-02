
const MAX_HEADER_LENGTH = 151;
const MAX_SECTION_LENGTH = 3000;

export class SlackMessage {

  private blocks: any[] = [];

  addHeader(text: string) {
    this.blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: text.substring(0, MAX_HEADER_LENGTH - 1),
        emoji: true,
      },
    });
    return this;
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
    return this;
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
    return this;
  }

  addLink(text: string, target: string) {
    this.blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${target}|${text}>`,
      },
    });
    return this;
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
    return this;
  }

  getSlackMessage() {
    return {
      blocks: this.blocks,
    };
  }

}
