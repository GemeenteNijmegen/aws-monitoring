import axios from 'axios';
import { UnhandledEventFormatter, AlarmMessageFormatter, EcsMessageFormatter, Ec2MessageFormatter } from './MessageFormatter';

/**
 * This maps the type of notifications this lambda can handle. Not all notifications should trigger
 * a notification, and different messages get formatted differently. Notifications that can't be mapped
 * will be processed as an 'unhandledEvent'.
 */
const events = {
  'CloudWatch Alarm State Change': {
    shouldTriggerAlert: (message: any) => cloudwatchAlarmEventShouldTriggerAlert(message),
    formatter: AlarmMessageFormatter,
  },
  'ECS Task State Change': {
    shouldTriggerAlert: () => true,
    formatter: EcsMessageFormatter,
  },
  'EC2 Instance State-change Notification': {
    shouldTriggerAlert: () => true,
    formatter: Ec2MessageFormatter,
  },
  'unhandledEvent': {
    shouldTriggerAlert: () => false,
    formatter: UnhandledEventFormatter,
  },
};

export async function handler(event: any, _context: any) {
  console.log(JSON.stringify(event));
  const message = parseMessageFromEvent(event);
  if (!messageShouldTriggerAlert(message)) {
    return;
  }
  try {
    const params = slackMessageFromSNSMessage(message);
    await sendMessageToSlack(params);
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
 * Can be used to format specific messages. This checks if the event type
 * is found in 'eventTypes', if not it returns the special case 'unhandledEvent',
 * which guarantees it can always be mapped to one of the vallues in eventTypes.
 *
 * @returns {string} event type
 */
export function getEventType(message: any): keyof typeof events {
  const type = message?.['detail-type'];
  if (!type) return 'unhandledEvent';
  if (Object.keys(events).includes(type) !== undefined) {
    return type;
  } else {
    return 'unhandledEvent';
  }
}

export function messageShouldTriggerAlert(message: any): boolean {
  const eventType = getEventType(message);
  return events[eventType].shouldTriggerAlert(message);
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
export function slackMessageFromSNSMessage(message: any): any {
  const eventType = getEventType(message);
  const formatter = new events[eventType].formatter(message);
  // if (eventType == 'CloudWatch Alarm State Change') {
  //   formatter = new AlarmMessageFormatter(message);
  // } else if (eventType == 'ECS Task State Change') {
  //   formatter = new EcsMessageFormatter(message);
  // } else if (eventType == 'EC2 Instance State-change Notification') {
  //   formatter = new Ec2MessageFormatter(message);
  // } else {
  //   throw Error('Unknown event type');
  // }
  return formatter.formattedMessage();
}

/**
 * Use axios to send a message to Slack
 *
 * @param message the message
 * @returns axios response
 */
export async function sendMessageToSlack(message: any) {
  if (!process.env.SLACK_WEBHOOK_URL) {
    throw Error('No slack webhook url defined');
  }
  return axios.post(process.env.SLACK_WEBHOOK_URL, message);
}

