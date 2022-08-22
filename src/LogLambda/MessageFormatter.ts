import fs from 'fs';
import path from 'path';
import { getEventType } from './index';

interface messageParameters {
  title: string;
  message: string;
  context: string;
  url: string;
  url_text: string;
}
export class MessageFormatter {
  message: any;
  constructor(message: any) {
    this.message = message;
  }

  formattedMessage(): any {
    const parameters = this.messageParameters();
    const templateBuffer = fs.readFileSync(path.join(__dirname, 'template.json'));
    const templateString = templateBuffer.toString();
    let blockString = templateString.replace('<HEADER>', parameters.title);
    blockString = blockString.replace('<CONTEXT>', parameters.context);
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

  messageParameters(): messageParameters {
    return {
      title: '',
      message: '',
      context: '',
      url: '',
      url_text: '',
    };
  }
}


export class AlarmMessageFormatter extends MessageFormatter {
  constructor(message: string) {
    super(message);
  }

  messageParameters(): messageParameters {
    const message = this.message;
    let messageObject = {
      title: '',
      message: message?.detail.state.reason,
      context: getEventType(message),
      url: `https:/${message?.region}.console.aws.amazon.com/cloudwatch/home?region=${message?.region}#alarmsV2:alarm/${encodeURIComponent(message.detail.alarmName)}`,
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
  constructor(message: string) {
    super(message);
  }

  messageParameters(): messageParameters {
    const message = this.message;
    const containerString = message?.detail?.containers.map((container: { name: any; lastStatus: any }) => `${container.name} (${container.lastStatus})`).join('\\n - ');
    const clusterName = message?.detail?.clusterArn.split('/').pop();
    let messageObject = {
      title: '',
      message: `Containers involved: \\n - ${containerString}`,
      context: `${getEventType(message)}, cluster ${clusterName}`,
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


export class Ec2MessageFormatter extends MessageFormatter {
  constructor(message: string) {
    super(message);
  }

  messageParameters(): messageParameters {
    const message = this.message;
    const status = message?.detail?.state;
    let messageObject = {
      title: `EC2 instance ${status}`,
      message: `Instance id: ${message?.detail?.instanceId}`,
      context: `${getEventType(message)}`,
      url: `https://${message?.region}.console.aws.amazon.com/ec2/v2/home?region=${message?.region}#InstanceDetails:instanceId=${message?.detail?.instanceId}`,
      url_text: 'Bekijk instance',
    };
    return messageObject;
  }
}

export class UnhandledEventFormatter extends MessageFormatter {
  constructor(message: string) {
    super(message);
  }

  messageParameters(): messageParameters {
    let messageObject = {
      title: 'Unhandled event',
      message: `Monitoring topic received an unhandled event. No message format available. Message: \n\`\`\`${JSON.stringify(this.message)}\`\`\` `,
      context: 'unhandled event from SNS topic',
      url: 'https://eu-west-1.console.aws.amazon.com/cloudwatch/home?region=eu-west-1',
      url_text: 'Open CloudWatch',
    };
    return messageObject;
  }
}
