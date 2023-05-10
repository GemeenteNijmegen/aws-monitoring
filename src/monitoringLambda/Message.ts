import { SlackMessage } from './SlackMessage';
import { TopDeskIncident } from './TopDeskIncident';

export interface MessageProps {
  header?: string;
  context?: { [name: string]: string };
  sections?: string[];
  link?: {
    text: string;
    target: string;
  };
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
  }

  addLink(text: string, target: string) {
    this.message.link = { text, target };
  }


  getSlackMessage() {
    return SlackMessage.from(this.message);
  }

  getTopDeskIncident() {
    return new TopDeskIncident(this.message);
  }

}

