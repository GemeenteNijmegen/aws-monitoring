import fs from 'fs';
import path from 'path';
import { getEventType } from './index';

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
export class MessageFormatter {
  message: any;
  account: string;
  constructor(message: any, account: string) {
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


export class AlarmMessageFormatter extends MessageFormatter {

  messageParameters(): MessageParameters {
    const message = this.message;
    let messageObject = {
      title: '',
      message: message?.detail.state.reason,
      context: {
        type: getEventType(message),
        account: this.account,
      },
      url: `https://${message?.region}.console.aws.amazon.com/cloudwatch/home?region=${message?.region}#alarmsV2:alarm/${encodeURIComponent(message.detail.alarmName)}`,
      url_text: 'Bekijk alarm',
    };
    if (message?.detail?.state?.value == 'ALARM') {
      messageObject.title = `❗️ Alarm: ${message.detail.alarmName}`;
    } else if (message?.detail?.state?.value == 'OK') {
      messageObject.title = `✅ Alarm ended: ${message.detail.alarmName}`;
    } else if (message?.detail?.state?.value == 'INSUFFICIENT_DATA') {
      messageObject.title = `Insufficient data: ${message.detail.alarmName}`;
    }
    return messageObject;
  }
}


export class EcsMessageFormatter extends MessageFormatter {

  messageParameters(): MessageParameters {
    const message = this.message;
    const containerString = message?.detail?.containers.map((container: { name: any; lastStatus: any }) => `${container.name} (${container.lastStatus})`).join('\\n - ');
    const clusterName = message?.detail?.clusterArn.split('/').pop();
    let messageObject = {
      title: '',
      message: `Containers involved: \\n - ${containerString}`,
      context: {
        type: `${getEventType(message)}, cluster ${clusterName}`,
        account: this.account,
      },
      url: `https://${message?.region}.console.aws.amazon.com/ecs/home?region=${message?.region}#/clusters/${clusterName}/services`,
      url_text: 'Bekijk cluster',
    };
    const status = message?.detail?.lastStatus;
    const desiredStatus = message?.detail?.desiredStatus;
    if (status != desiredStatus) {
      messageObject.title = `❗️ ECS Task not in desired state (state ${status}, desired ${desiredStatus})`;
    } else {
      messageObject.title = `✅ ECS Task in desired state (${status})`;
    }
    return messageObject;
  }
}

export class DevopsGuruMessageFormatter extends MessageFormatter {

  messageParameters(): MessageParameters {
    const message = this.message;
    let messageObject = {
      title: 'DevopsGuru Insight',
      message: message?.detail?.insightDescription,
      context: {
        type: `${getEventType(message)}`,
        account: this.account,
      },
      url: message?.detail?.insightUrl,
      url_text: 'Bekijk insight',
    };

    if (message?.detail?.insightSeverity == 'high') {
      messageObject.title = `❗️ ${messageObject.title}`;
    }
    return messageObject;
  }
}


export class CertificateExpiryFormatter extends MessageFormatter {
  messageParameters(): MessageParameters {
    const message = this.message;
    let messageObject = {
      title: 'Certificate nearing expiration',
      message: `${message?.detail?.CommonName} verloopt over *${message?.detail?.DaysToExpiry} dagen.`,
      context: {
        type: `${getEventType(message)}`,
        account: this.account,
      },
      url: 'https://eu-west-1.console.aws.amazon.com/acm/home?region=eu-west-1',
      url_text: 'Bekijk certificaten',
    };

    if (message?.detail?.insightSeverity == 'high') {
      messageObject.title = `❗️ ${messageObject.title}`;
    }
    return messageObject;
  }
}


export class Ec2MessageFormatter extends MessageFormatter {

  messageParameters(): MessageParameters {
    const message = this.message;
    const status = message?.detail?.state;
    let messageObject = {
      title: `EC2 instance ${status}`,
      message: `Instance id: ${message?.detail?.['instance-id']}`,
      context: {
        type: `${getEventType(message)}`,
        account: '',
      },
      url: `https://${message?.region}.console.aws.amazon.com/ec2/v2/home?region=${message?.region}#InstanceDetails:instanceId=${message?.detail?.['instance-id']}`,
      url_text: 'Bekijk instance',
    };
    return messageObject;
  }
}

export class UnhandledEventFormatter extends MessageFormatter {

  messageParameters(): MessageParameters {
    let messageObject = {
      title: 'Unhandled event',
      message: `Monitoring topic received an unhandled event. No message format available. Message: \n\`\`\`${JSON.stringify(this.message)}\`\`\` `,
      context: {
        type: 'unhandled event from SNS topic',
        account: this.account,
      },
      url: 'https://eu-west-1.console.aws.amazon.com/cloudwatch/home?region=eu-west-1',
      url_text: 'Open CloudWatch',
    };
    return messageObject;
  }
}