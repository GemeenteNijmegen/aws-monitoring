import { HandledEvent, IHandler, Priority } from './IHandler';
import { UnhandledEventFormatter, AlarmMessageFormatter, EcsMessageFormatter, Ec2MessageFormatter, DevopsGuruMessageFormatter, CertificateExpiryFormatter, CodePipelineFormatter, HealthDashboardFormatter, InspectorFindingFormatter, MessageFormatter, DriftDetectionStatusFormatter, SecurityHubFormatter, OrgTrailMessageFormatter } from './MessageFormatter';
import { patternMatchesString, stringMatchesPatternInArray, stringMatchingPatternInArray } from './utils';

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
  formatter: (message: any, account: string, priority: string) => MessageFormatter<any>;
  priority: Priority;
}

const events: Record<string, Event> = {
  'CloudWatch Alarm State Change': {
    shouldTriggerAlert: (message: any) => cloudwatchAlarmEventShouldTriggerAlert(message),
    formatter: (message, account, priority) => new AlarmMessageFormatter(message, account, priority),
    priority: 'high',
  },
  'ECS Task State Change': {
    shouldTriggerAlert: () => true,
    formatter: (message, account, priority) => new EcsMessageFormatter(message, account, priority),
    priority: 'high',
  },
  'EC2 Instance State-change Notification': {
    shouldTriggerAlert: () => true,
    formatter: (message, account, priority) => new Ec2MessageFormatter(message, account, priority),
    priority: 'high',
  },
  'DevOps Guru New Insight Open': {
    shouldTriggerAlert: () => true,
    formatter: (message, account, priority) => new DevopsGuruMessageFormatter(message, account, priority),
    priority: 'high',
  },
  'ACM Certificate Approaching Expiration': {
    shouldTriggerAlert: () => true,
    formatter: (message, account, priority) => new CertificateExpiryFormatter(message, account, priority),
    priority: 'high',
  },
  'CodePipeline Pipeline Execution State Change': {
    shouldTriggerAlert: () => true,
    formatter: (message, account, priority) => new CodePipelineFormatter(message, account, priority),
    priority: 'low',
  },
  'AWS Health Event': {
    shouldTriggerAlert: () => true,
    formatter: (message, account, priority) => new HealthDashboardFormatter(message, account, priority),
    priority: 'high',
  },
  'Inspector2 Finding': {
    shouldTriggerAlert: () => true,
    formatter: (message, account, priority) => new InspectorFindingFormatter(message, account, priority),
    priority: 'high',
  },
  'CloudFormation Drift Detection Status Change': {
    shouldTriggerAlert: () => true,
    formatter: (message, account, priority) => new DriftDetectionStatusFormatter(message, account, priority),
    priority: 'high',
  },
  'SecurityHub': {
    shouldTriggerAlert: () => true,
    formatter: (message, account, priority) => new SecurityHubFormatter(message, account, priority),
    priority: 'high',
  },
  'OrgTrailFromMPA': {
    shouldTriggerAlert: () => true,
    formatter: (message, account, priority) => new OrgTrailMessageFormatter(message, account, priority),
    priority: 'high',
  },
  'unhandledEvent': {
    shouldTriggerAlert: () => false,
    formatter: (message, account, priority) => new UnhandledEventFormatter(message, account, priority),
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
    if (!eventShouldTriggerAlert(event)) {
      return false;
    }
    const eventType = getEventType(message, event);
    const account = this.getAccount(message);
    const formatter = events[eventType].formatter(message, account, events[eventType].priority);
    const priority = events[eventType].priority;

    return {
      priority: priority,
      message: formatter.formattedMessage(),
    };
  }

  getAccount(message: any): string {
    const account = message?.account || message?.recipientAccountId || message?.AccountId;
    return account ?? '';
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
export function getEventType(message: any, event?: any): keyof typeof events {
  const type = message?.['detail-type'];
  if (Object.keys(events).includes(type)) {
    return type;
  }
  const subject = event?.Records[0]?.Sns?.Subject;
  if (subject) {
    const eventSubject = stringMatchingPatternInArray(Object.keys(events), subject);
    if (eventSubject) {
      return eventSubject;
    }
    // detect orgtrail notification from mpa account
    if (patternMatchesString('detected in ', subject)) {
      return 'OrgTrailFromMPA';
    }
    // detect alarms from mpa account
    if (message?.AlarmName) {
      return 'CloudWatch Alarm State Change';
    }
  }
  return 'unhandledEvent';
}

function eventShouldTriggerAlert(event: any): boolean {
  const message = parseMessageFromEvent(event);
  const eventType = getEventType(message, event);
  return events[eventType].shouldTriggerAlert(message);
}

/**
 * Only alerts from or to state ALARM should notify. From insufficient data to
 * OK or vice versa is not a relevant alert. New or ended alarms should report.
 *
 * @param message an SNS message containing a cloudwatch state changed event
 */
function cloudwatchAlarmEventShouldTriggerAlert(message: any): boolean {
  const alarmName = message?.detail?.alarmName || message?.AlarmName;
  if (stringMatchesPatternInArray(excludedAlarms, alarmName)) {
    return false;
  }
  const state = message?.detail?.state?.value || message?.NewStateValue;
  const previousState = message?.detail?.previousState?.value || message?.OldStateValue;
  if (state == 'ALARM' || previousState == 'ALARM') {
    return true;
  }
  return false;
}
