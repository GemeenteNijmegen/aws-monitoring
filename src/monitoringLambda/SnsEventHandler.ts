import { HandledEvent, IHandler } from './IHandler';
import { UnhandledEventFormatter, AlarmMessageFormatter, EcsMessageFormatter, EcsDeploymentStateChangeFormatter, EcsServiceActionFormatter, Ec2MessageFormatter, DevopsGuruMessageFormatter, CertificateExpiryFormatter, CodePipelineFormatter, HealthDashboardFormatter, InspectorFindingFormatter, MessageFormatter, DriftDetectionStatusFormatter, SecurityHubFormatter, OrgTrailMessageFormatter, CustomSnsMessageFormatter } from './MessageFormatter';
import { patternMatchesString, stringMatchesPatternInArray, stringMatchingPatternInArray } from './utils';
import { Configuration } from '../DeploymentEnvironments';
import { Priority, Statics } from '../statics';
import { classifyEcsTask } from './EcsTaskClassifier';

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
  /**
   * Static priority for this event type. Overrides the SNS topic priority.
   * Use resolvePriority instead when the priority depends on message content.
   */
  priority?: Priority;
  /**
   * Per-message priority resolver. Takes precedence over the static priority field.
   * Use this when the same event type can produce different priorities depending on the message.
   */
  resolvePriority?: (message: any) => Priority;
}

const events: Record<string, Event> = {
  'CloudWatch Alarm State Change': {
    shouldTriggerAlert: (message: any) => cloudwatchAlarmEventShouldTriggerAlert(message),
    formatter: (message, account, priority) => new AlarmMessageFormatter(message, account, priority),
  },
  'ECS Task State Change': {
    shouldTriggerAlert: (message: any) => ecsTaskStateShouldTriggerAlert(message),
    formatter: (message, account, priority) => new EcsMessageFormatter(message, account, priority),
    resolvePriority: ecsTaskPriority,
  },
  'ECS Deployment State Change': {
    shouldTriggerAlert: (message: any) => message?.detail?.eventName === 'SERVICE_DEPLOYMENT_FAILED',
    formatter: (message, account, priority) => new EcsDeploymentStateChangeFormatter(message, account, priority),
    priority: 'high',
  },
  'ECS Service Action': {
    shouldTriggerAlert: (message: any) => ALERTED_SERVICE_ACTIONS.has(message?.detail?.eventName),
    formatter: (message, account, priority) => new EcsServiceActionFormatter(message, account, priority),
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
  'CustomSnsMessage': {
    shouldTriggerAlert: () => true,
    formatter: (message, account, priority) => new CustomSnsMessageFormatter(message, account, priority),
  },
  'unhandledEvent': {
    shouldTriggerAlert: () => false,
    formatter: (message, account, priority) => new UnhandledEventFormatter(message, account, priority),
    priority: 'high',
  },
};

export class SnsEventHandler implements IHandler {

  private configuration: Configuration;
  constructor(configuration: Configuration) {
    this.configuration = configuration;
  }

  canHandle(event: any): boolean {
    const records = event?.Records;
    const message = records ? records[0]?.Sns?.Message : undefined;
    return message != undefined;
  }

  handle(event: any): HandledEvent | false {
    const message = parseMessageFromEvent(event);
    if (!this.eventShouldTriggerAlert(event)) {
      return false;
    }
    const eventType = getEventType(message, event);
    const account = this.getAccount(message);

    const priority = this.getPriority(event, eventType, account, message);
    const formatter = events[eventType].formatter(message, account, priority);

    return {
      priority: priority,
      message: formatter.formattedMessage(),
    };
  }

  /** Get the priority of this message
   *
   * Priority is determined by (in ascending order of priority):
   * - priority of the SNS topic originating this event
   * - priority of the event type of this notification
   * - maximum priority level for the originating account.
   */
  getPriority(event: any, eventType: string, account: string, message?: any) {
    const topicPriority = this.parsePriorityFromEvent(event);
    const eventDef = events[eventType];
    let priority = eventDef.resolvePriority?.(message) ?? eventDef.priority ?? topicPriority;
    priority = this.limitPriorityForNonProductionAccounts(priority, account);
    return priority;
  };

  /** If priority is high or critical, reset to medium for non-production-accounts */
  private limitPriorityForNonProductionAccounts(priority: Priority, account: string):Priority {
    if (['high', 'critical'].includes(priority)) {
      const accountConfiguration = this.configuration.deployToEnvironments.find(deploymentEnv => deploymentEnv.env.account == account);
      if (accountConfiguration?.accountType && accountConfiguration.accountType != 'production') {
        priority = 'medium';
      }
    }
    return priority;
  }

  getAccount(message: any): string {
    const account = message?.account || message?.recipientAccountId || message?.AccountId;
    return account ?? '';
  }

  parsePriorityFromEvent(event: any) : Priority {
    try {
      const topicArn = event?.Records[0]?.Sns?.TopicArn;
      if (topicArn.endsWith('high')) {
        return 'high';
      } else if (topicArn.endsWith('low')) {
        return 'low';
      } else if (topicArn.endsWith('medium')) {
        return 'medium';
      } else {
        return 'critical';
      }
    } catch (error) {
      console.error('Could not find priority, defaulting to critical', error);
    }
    return 'critical';
  }

  eventShouldTriggerAlert(event: any): boolean {
    const message = parseMessageFromEvent(event);
    const eventType = getEventType(message, event);
    return events[eventType].shouldTriggerAlert(message);
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
    if (message?.messageType == Statics.mpaMonitoringEventMessageType) {
      return 'CustomSnsMessage';
    }
  }
  return 'unhandledEvent';
}


const ALERTED_SERVICE_ACTIONS = new Set(['SERVICE_TASK_START_IMPAIRED', 'SERVICE_TASK_PLACEMENT_FAILURE']);

function ecsTaskPriority(message: any): Priority {
  // Service task unexpected stops are medium (a single stop is informational, not critical).
  // Scheduled / one-off failures are high (the task is the unit of work — failure is the outcome).
  return classifyEcsTask(message?.detail) === 'service' ? 'medium' : 'high';
}

const SUPPRESSED_SERVICE_STOP_CODES = new Set([
  'ServiceSchedulerInitiated',
  'UserInitiated',
  'SpotInterruption',
  'TerminationNotice',
]);

function ecsTaskStateShouldTriggerAlert(message: any): boolean {
  const detail = message?.detail;

  // Suppress all intermediate transitions for every task type
  if (detail?.lastStatus !== 'STOPPED') {
    return false;
  }

  const stopCode = detail?.stopCode;

  if (classifyEcsTask(detail) === 'service') {
    if (SUPPRESSED_SERVICE_STOP_CODES.has(stopCode)) {
      return false;
    }
    return stopCode === 'EssentialContainerExited' || stopCode === 'TaskFailedToStart';
  }

  // Scheduled / one-off: alert on TaskFailedToStart or non-zero exit
  if (stopCode === 'TaskFailedToStart') {
    return true;
  }
  if (stopCode === 'EssentialContainerExited') {
    const containers: any[] = detail?.containers ?? [];
    return !containers.every((c: any) => c.exitCode === 0);
  }
  return true;
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
