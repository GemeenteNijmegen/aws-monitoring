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
        lines.push(`<p><b>${entry[0]}</b> ${entry[1]}</p>`);
      });
    }

    if (this.message.sections) {
      this.message.sections.forEach(section => lines.push(`<p>${section}</p>`));
    }

    if (this.message.link) {
      lines.push(`<p><a href="${this.message.link.target}">${this.message.link.text}</a></p>`);
    }

    return lines.join('\n');
  }

  getIncident(priority: string) {
    return {
      title: this.message.header,
      description: this.getHtmlDescription(),
      priority: priority,
    };
  }


}

