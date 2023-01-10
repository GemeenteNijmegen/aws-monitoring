import { getAccount } from '.';
import { HandledEvent, IHandler, Priority } from './IHandler';
import { UnhandledEventFormatter, AlarmMessageFormatter, EcsMessageFormatter, Ec2MessageFormatter, DevopsGuruMessageFormatter, CertificateExpiryFormatter, CodePipelineFormatter, HealthDashboardFormatter, InspectorFindingFormatter, MessageFormatter } from './MessageFormatter';

/**
 * This maps the type of notifications this lambda can handle. Not all notifications should trigger
 * a notification, and different messages get formatted differently. Notifications that can't be mapped
 * will be processed as an 'unhandledEvent'.
 */

const excludedAlarms = [
  'CIS-Unauthorized Activity Attempt',
  'CIS-Unauthorized Activity Attempt (Custom)',
  'ApplicationInsights/ApplicationInsights-ContainerInsights-ECS_CLUSTER-eform-cluster/ECS/ContainerInsights/NetworkRxBytes/eform-cluster/',
  'ApplicationInsights/ApplicationInsights-ContainerInsights-ECS_CLUSTER-eform-cluster/ECS/ContainerInsights/NetworkTxBytes/eform-cluster/',
  'ApplicationInsights/ApplicationInsights-ContainerInsights-ECS_CLUSTER-eform-cluster/AWS/ApplicationELB/TargetResponseTime.*',
];

interface Event {
  shouldTriggerAlert: (message?: any) => boolean;
  formatter: (message: any, account: string) => MessageFormatter<any>;
  priority: Priority;
}

const events: Record<string, Event> = {
  'CloudWatch Alarm State Change': {
    shouldTriggerAlert: (message: any) => cloudwatchAlarmEventShouldTriggerAlert(message),
    formatter: (m, a) => new AlarmMessageFormatter(m, a),
    priority: 'high',
  },
  'ECS Task State Change': {
    shouldTriggerAlert: () => true,
    formatter: (m, a) => new EcsMessageFormatter(m, a),
    priority: 'high',
  },
  'EC2 Instance State-change Notification': {
    shouldTriggerAlert: () => true,
    formatter: (m, a) => new Ec2MessageFormatter(m, a),
    priority: 'high',
  },
  'DevOps Guru New Insight Open': {
    shouldTriggerAlert: () => true,
    formatter: (m, a) => new DevopsGuruMessageFormatter(m, a),
    priority: 'high',
  },
  'ACM Certificate Approaching Expiration': {
    shouldTriggerAlert: () => true,
    formatter: (m, a) => new CertificateExpiryFormatter(m, a),
    priority: 'high',
  },
  'CodePipeline Pipeline Execution State Change': {
    shouldTriggerAlert: () => true,
    formatter: (m, a) => new CodePipelineFormatter(m, a),
    priority: 'low',
  },
  'AWS Health Event': {
    shouldTriggerAlert: () => true,
    formatter: (m, a) => new HealthDashboardFormatter(m, a),
    priority: 'high',
  },
  'Inspector2 Finding': {
    shouldTriggerAlert: () => true,
    formatter: (m, a) => new InspectorFindingFormatter(m, a),
    priority: 'high',
  },
  'unhandledEvent': {
    shouldTriggerAlert: () => false,
    formatter: (m, a) => new UnhandledEventFormatter(m, a),
    priority: 'high',
  },
};

export class SnsEventHandler implements IHandler {

  canHandle(event: any): boolean {
    const records = event?.Records;
    const message = records ? records[0]?.Sns?.Message : undefined;
    return message != undefined;
  }

  handle(event: any): HandledEvent | false {

    const message = parseMessageFromEvent(event);
    if (!messageShouldTriggerAlert(message)) {
      return false;
    }

    const eventType = getEventType(message);
    const formatter = events[eventType].formatter(message, getAccount());
    const priority = events[eventType].priority;

    return {
      priority: priority,
      message: formatter.formattedMessage(),
    };
  }

}

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
 * @param excludedAlarms the list of allarms to exclude
 */
function cloudwatchAlarmEventShouldTriggerAlert(message: any): boolean {

  if (stringMatchesPatternInArray(excludedAlarms, message?.detail?.alarmName)) {
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
 * Check if a string (case insensitive, regex allowed) is included in an array of strings.
 *
 * @param array an array of lowercased strings
 * @param string the string to match in the array
 * @returns boolean
 */
export function stringMatchesPatternInArray(array: string[], string: string): boolean {
  const lowerCasedString = string.toLowerCase();
  const match = array.find((potentialMatch) => {
    const regExp = new RegExp(potentialMatch.toLowerCase());
    return regExp.test(escapeRegExp(lowerCasedString));
  });
  return match !== undefined;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}