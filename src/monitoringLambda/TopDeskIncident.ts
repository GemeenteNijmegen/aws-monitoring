import { MessageProps } from './Message';

export class TopDeskIncident {

  private message: MessageProps;

  constructor(message: MessageProps) {
    this.message = message;
  }

  getHtmlDescription() {
    const lines: string[] = [];

    if (this.message.context) {
      Object.entries(this.message.context).forEach(entry => {
        lines.push(`<b>${entry[0]}</b> ${entry[1]}`);
      });
    }

    if (this.message.sections) {
      this.message.sections.forEach(section => lines.push(section));
    }

    if (this.message.link) {
      lines.push(`<a href="${this.message.link.target}">${this.message.link.text}</a>`);
    }

    return lines.join('<br/>');
  }

  getIncident(priority: string) {
    return {
      title: this.message.header,
      description: this.getHtmlDescription(),
      priority: priority,
    };
  }


}

