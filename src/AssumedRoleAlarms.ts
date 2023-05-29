import { RemovalPolicy, aws_cloudwatch_actions as actions } from 'aws-cdk-lib';
import { Alarm } from 'aws-cdk-lib/aws-cloudwatch';
import { FilterPattern, LogGroup, MetricFilter } from 'aws-cdk-lib/aws-logs';
import { ITopic, Topic } from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { Priority } from './statics';


export interface AssumedRoleAlarmsProps {
  cloudTrailLogGroupName: string;
  /**
   * Provide the rolenames and the priority of the notification
   */
  roles: { [key: string]: Priority };
}

export class AssumedRoleAlarms extends Construct {

  private low: ITopic;
  private medium: ITopic;
  private high: ITopic;
  private critical: ITopic;

  constructor(scope: Construct, id: string, props: AssumedRoleAlarmsProps) {
    super(scope, id);

    this.low = Topic.fromTopicArn(this, 'low', 'arn:aws:sns:eu-central-1:427617903428:landingzone-platform-events-low');
    this.medium = Topic.fromTopicArn(this, 'medium', 'arn:aws:sns:eu-central-1:427617903428:landingzone-platform-events-medium');
    this.high = Topic.fromTopicArn(this, 'high', 'arn:aws:sns:eu-central-1:427617903428:landingzone-platform-events-high');
    this.critical = Topic.fromTopicArn(this, 'critical', 'arn:aws:sns:eu-central-1:427617903428:landingzone-platform-events-critical');

    this.alarmOnAssumedRoles(props.roles, props.cloudTrailLogGroupName);
  }

  private alarmOnAssumedRoles(roles: { [key: string]: Priority }, cloudTrailLogGroupName: string) {
    const logGroup = LogGroup.fromLogGroupName(this, 'cloudtrail', cloudTrailLogGroupName);

    Object.entries(roles).forEach(entry => {
      const role = entry[0];
      const priority = entry[1];
      const filter = new MetricFilter(this, `assume-${role}-metric`, {
        logGroup,
        metricNamespace: 'Monitoring',
        metricName: `${role}RoleAssumed`,
        filterPattern: FilterPattern.literal(`{ ($.eventName="AssumeRole") && ($.requestParameters.roleArn = "*${role}") }`),
        metricValue: '1',
      });
      filter.applyRemovalPolicy(RemovalPolicy.DESTROY);

      const alarm = new Alarm(this, `assume-${role}-alarm`, {
        metric: filter.metric({
          statistic: 'sum',
        }),
        evaluationPeriods: 1,
        threshold: 1,
        alarmName: `Role ${role} was assumed`,
        alarmDescription: `This alarm triggers if the role ${role} is assumed by any user. This role has more priviliges than normal use require, so when it is assumed it's use should be logged and explained.`,
      });

      alarm.addAlarmAction(new actions.SnsAction(this.getNotificationTopic(priority)));
      alarm.applyRemovalPolicy(RemovalPolicy.DESTROY);
    });
  }

  private getNotificationTopic(priority: Priority): ITopic {
    switch (priority) {
      case 'low': return this.low;
      case 'medium': return this.medium;
      case 'high': return this.high;
      case 'critical': return this.critical;
      default: return this.critical;
    }
  }
}
