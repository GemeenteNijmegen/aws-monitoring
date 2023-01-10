import fs from 'fs';
import path from 'path';
import { CloudWatchLogsDecodedData } from 'aws-lambda';

const codeBlock = '```';

interface MessageParameters {
  title: string;
  message: string;
  context: {
    type: string;
    account: string;
  };
}

export class MessageFormatter<T> {
  message: T;
  account: string;
  constructor(message: T, account: string) {
    this.message = message;
    this.account = account;
  }

  /**
   * Do some cleanup / validation of the MessageParameters object.
   *
   * @param parameters {Messageparameters} the filled params
   * @returns {Messageparameters} the cleaned params
   */
  cleanParameters(parameters: MessageParameters): MessageParameters {
    // Slack header block allows text to be max 151 chars long.
    const maxHeaderLength = 151;
    parameters.title = parameters.title.substring(0, maxHeaderLength - 1);
    return parameters;
  }

  formattedMessage(): any {
    const parameters = this.cleanParameters(this.messageParameters());
    const templateBuffer = fs.readFileSync(path.join(__dirname, 'template.json'));
    const templateString = templateBuffer.toString();
    let blockString = templateString.replace('<HEADER>', parameters.title);
    blockString = blockString.replace('<CONTEXT_ACCOUNT>', parameters.context.account);
    blockString = blockString.replace('<CONTEXT_TYPE>', parameters.context.type);
    blockString = blockString.replace('<MESSAGE>', parameters.message);

    try {
      const message = JSON.parse(blockString);
      return message;
    } catch (error: any) {
      console.debug(error);
      console.debug(blockString);
    }
  }

  messageParameters(): MessageParameters {
    return {
      title: '',
      message: '',
      context: {
        type: '',
        account: this.account,
      },
    };
  }
}


export class LogsMessageFormatter extends MessageFormatter<CloudWatchLogsDecodedData> {

  messageParameters(): MessageParameters {
    let messageObject = {
      title: 'Log subscription',
      message: `*Log group:* ${this.message.logGroup} `,
      context: {
        type: 'logs',
        account: this.account,
      },
    };

    messageObject.message += codeBlock;
    this.message.logEvents.forEach(log => {
      messageObject.message += this.escapeJson(log.message + '\n');
    });
    messageObject.message += codeBlock;

    return messageObject;
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

