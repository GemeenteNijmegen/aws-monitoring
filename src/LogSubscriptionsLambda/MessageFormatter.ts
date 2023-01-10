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
  url: string;
  url_text: string;
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
    blockString = blockString.replace('<URL>', parameters.url);
    blockString = blockString.replace('<URL_TEXT>', parameters.url_text);
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
      url: '',
      url_text: '',
    };
  }
}


export class LogsMessageFormatter extends MessageFormatter<CloudWatchLogsDecodedData> {

  messageParameters(): MessageParameters {
    let messageObject = {
      title: '',
      message: `*Log group:* ${this.message.logGroup} `,
      context: {
        type: '',
        account: this.account,
      },
      url: '',
      url_text: '',
    };

    this.message.logEvents.forEach(log => {
      messageObject.message += `${codeBlock} ${log.message} ${codeBlock}`;
    });

    return messageObject;
  }
}