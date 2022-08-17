import fs from 'fs';
import path from 'path';
import axios from 'axios';

export async function handler(event:any, _context: any) {
  console.log(JSON.stringify(event));
  const message = parseMessageFromEvent(event);
  if (!messageShouldTriggerAlert(message)) {
    return;
  }
  try {
    const params = slackParamsFromMessage(message);
    await sendMessageToSlack(createMessage(params));
  } catch (error) {
    console.error(error);
  }
};

export function parseMessageFromEvent(event: any): any {
  try {
    return JSON.parse(event?.Records[0]?.Sns?.Message);
  } catch (error) {
    console.error('Failed parsing message, not JSON? Message: ' + event?.Records[0]?.Sns?.Message);
  }
}

/**
 * Get the event type from event
 *
 * Can be used to format specific messages
 * @returns {string} event type
 */
export function getEventType(message: any): string {
  return message?.['detail-type'];
}

export function messageShouldTriggerAlert(message: any): boolean {
  const eventType = getEventType(message);
  if (eventType == 'CloudWatch Alarm State Change') {
    return cloudwatchAlarmEventShouldTriggerAlert(message);
  }

  if (eventType == 'ECS Task State Change') {
    return true;
  }

  console.log('unhandled event, will not notify');
  return false;
}

/**
 * Only alerts from or to state ALARM should notify. From insufficient data to
 * OK or vice versa is not a relevant alert. New or ended alarms should report.
 *
 * @param message an SNS message containing a cloudwatch state changed event
 */
function cloudwatchAlarmEventShouldTriggerAlert(message: any): boolean {
  // List of alarms that are too noisy for immediate notifications
  const excludedAlarms = [
    'CIS-Unauthorized Activity Attempt',
    'CIS-Unauthorized Activity Attempt (Custom)',
    'ApplicationInsights/ApplicationInsights-ContainerInsights-ECS_CLUSTER-eform-cluster/ECS/ContainerInsights/NetworkRxBytes/eform-cluster/',
    'ApplicationInsights/ApplicationInsights-ContainerInsights-ECS_CLUSTER-eform-cluster/ECS/ContainerInsights/NetworkTxBytes/eform-cluster/',
  ];

  if (excludedAlarms.includes(message?.detail?.alarmName)) {
    return false;
  }
  const state = message?.detail?.state?.value;
  const previousState = message?.detail?.previousState?.value;
  if (state == 'ALARM' || previousState == 'ALARM') {
    return true;
  }
  return false;
}

/**
 * Get params for the slack message from the SNS message
 *
 * @param message SNS event message
 * @returns {object} a message object
 */
export function slackParamsFromMessage(message: any): any {
  const eventType = getEventType(message);
  let formatter: MessageFormatter;
  if (eventType == 'CloudWatch Alarm State Change') {
    formatter = new AlarmMessageFormatter(message);
  } else if (eventType == 'ECS Task State Change') {
    formatter = new EcsMessageFormatter(message);
  } else {
    throw Error('Unknown event type');
  }
  return formatter.messageParameters();
}

/**
 * Generate a message object for slack
 *
 * Based on a json template file and provided values
 *
 * @param messageObject the values for message template
 * @returns {object} an object formatted for slack (see https://app.slack.com/block-kit-builder/)
 */
export function createMessage(messageObject: { title: any; context: any; message: any; url: any; url_text: any }): any {
  const templateBuffer = fs.readFileSync(path.join(__dirname, 'template.json'));
  const templateString = templateBuffer.toString();
  let blockString = templateString.replace('<HEADER>', messageObject.title);
  blockString = blockString.replace('<CONTEXT>', messageObject.context);
  blockString = blockString.replace('<MESSAGE>', messageObject.message);
  blockString = blockString.replace('<URL>', messageObject.url);
  blockString = blockString.replace('<URL_TEXT>', messageObject.url_text);
  try {
    const message = JSON.parse(blockString);
    return message;
  } catch (error: any) {
    console.debug(error);
    console.debug(blockString);
  }
}

/**
 * Use axios to send a message to Slack
 *
 * @param message the message
 * @returns axios response
 */
async function sendMessageToSlack(message: any) {
  if (!process.env.SLACK_WEBHOOK_URL) {
    throw Error('No slack webhook url defined');
  }
  return axios.post(process.env.SLACK_WEBHOOK_URL, message);
}

interface messageParameters {
  title: string;
  message: string;
  context: string;
  url: string;
  url_text: string;
}

class MessageFormatter {
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


class AlarmMessageFormatter extends MessageFormatter {
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


class EcsMessageFormatter extends MessageFormatter {
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