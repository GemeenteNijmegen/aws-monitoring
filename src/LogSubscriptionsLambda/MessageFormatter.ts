import { CloudWatchLogsDecodedData } from 'aws-lambda';

const codeBlock = '```';

export class LogsMessageFormatter {

  message: CloudWatchLogsDecodedData;
  account: string;

  constructor(message: CloudWatchLogsDecodedData, account: string) {
    this.message = message;
    this.account = account;
  }

  formattedMessage(): any {

    const message = new SlackMessage();
    message.addHeader("Log subscription");
    message.addContext({
      account: this.account,
      "log group": this.message.logGroup,
    });

    this.message.logEvents.forEach(log => {
      const text = `${codeBlock}${this.escapeJson(log.message)}${codeBlock}`;
      message.addSection(text);
    });

    return message.getSlackMessage();
  }

  private escapeJson(json: string) {
    return json.replace(/\n/g, '\\n')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/&/g, '\\&')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/\\b/g, '\\b')
      .replace(/\f/g, '\\f');
  }

}

class SlackMessage {

  private blocks: any[] = [];

  addHeader(text: string) {
    this.blocks.push({
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": text,
        "emoji": true
      }
    });
  }

  addContext(context: { [name: string]: string }) {
    const elements = Object.entries(context).map((entry) => {
      return {
        "type": "mrkdwn",
        "text": `${entry[0]}: *${entry[1]}*`,
      }
    });
    this.blocks.push({
      type: "context",
      elements: elements
    });
  }

  addSection(text: string){
    if(!text || text.length > 3000){
      console.log("Message is empty or too long, max 3000", text);
      text = '(message ommited)'
    }
    this.blocks.push({
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": text,
      }
    });
  }

  getSlackMessage(){
    return {
      blocks: this.blocks,
    }
  }

}

