import { SlackMessage } from './SlackMessage';

export interface MessageProps {
  header?: string;
  context?: { [name: string]: string };
  /**
   * Sections, links and buttons in the order they are rendered
   */
  parts?: MessagePart[];
}

export type MessagePart =
  { kind: 'section'; text: string } |
  { kind: 'link'; text: string; target: string } |
  { kind: 'button'; text: string; actionId: string; payload: any };

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
    this.addPart({ kind: 'section', text });
  }

  addLink(text: string, target: string) {
    this.addPart({ kind: 'link', text, target });
  }

  addButton(text: string, actionId: string, payload: any) {
    this.addPart({ kind: 'button', text, actionId, payload });
  }

  private addPart(part: MessagePart) {
    (this.message.parts ??= []).push(part);
  }

  getSlackMessage() {
    return SlackMessage.from(this.message);
  }

}

