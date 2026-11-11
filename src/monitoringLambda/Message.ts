import { SlackMessage } from './SlackMessage';

export interface MessageProps {
  header?: string;
  context?: { [name: string]: string };
  sections?: string[];
  links?: {
    text: string;
    target: string;
  }[];
  button?: {
    text: string;
    actionId: string;
    payload: any;
  };
  /**
   * Insertion order of sections, links and the button
   */
  order?: ('section' | 'link' | 'button')[];
}

export class Message {

  private message: MessageProps;

  constructor(message?: MessageProps) {
    if (message) {
      this.message = message;
    } else {
      this.message = {};
    }
  }

  addHeader(text: string) {
    this.message.header = text;
  }

  addContext(context: { [name: string]: string }) {
    this.message.context = context;
  }

  addSection(text: string) {
    if (!this.message.sections) {
      this.message.sections = [];
    }
    this.message.sections.push(text);
    this.recordOrder('section');
  }

  addLink(text: string, target: string) {
    if (!this.message.links) {
      this.message.links = [];
    }
    this.message.links.push({ text, target });
    this.recordOrder('link');
  }

  addButton(text: string, actionId: string, payload: any) {
    this.message.button = { text, actionId, payload };
    this.recordOrder('button');
  }

  private recordOrder(kind: 'section' | 'link' | 'button') {
    if (!this.message.order) {
      this.message.order = [];
    }
    this.message.order.push(kind);
  }

  getSlackMessage() {
    return SlackMessage.from(this.message);
  }

}

