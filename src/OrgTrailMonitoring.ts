import {
  aws_logs as logs,
  aws_logs_destinations as destinations,
  Stack,
} from 'aws-cdk-lib';
import { ITopic, Topic } from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { OrgTrailMonitorFunction } from './OrgtrailMonitorLambda/OrgTrailMonitor-function';
import { Priority } from './statics';

export interface OrgTrailMonitoringProps {
  cloudTrailLogGroupName: string;
}

export class OrgTrailMonitoring extends Construct {

  private low: ITopic;
  private medium: ITopic;
  private high: ITopic;
  private critical: ITopic;

  constructor(scope: Construct, id: string, props: OrgTrailMonitoringProps) {
    super(scope, id);

    this.low = Topic.fromTopicArn(this, 'low', this.getTopicArn('low'));
    this.medium = Topic.fromTopicArn(this, 'medium', this.getTopicArn('medium'));
    this.high = Topic.fromTopicArn(this, 'high', this.getTopicArn('high'));
    this.critical = Topic.fromTopicArn(this, 'critical', this.getTopicArn('critical'));

    const monitor = this.setupOrgTrailMonitoringLambda();
    this.addLogSubscriptionToOrgTrail(monitor, props.cloudTrailLogGroupName);

  }

  private addLogSubscriptionToOrgTrail(monitor: OrgTrailMonitorFunction, cloudTrailLogGroupName: string) {
    const orgTrail = logs.LogGroup.fromLogGroupName(this, 'orgtrail-log-group', cloudTrailLogGroupName);

    new logs.SubscriptionFilter(this, 'orgtrail-log-subscription', {
      destination: new destinations.LambdaDestination(monitor),
      logGroup: orgTrail,
      filterPattern: logs.FilterPattern.any(
        logs.FilterPattern.stringValue('$.eventSource', '=', 'kms.amazonaws.com'),
        logs.FilterPattern.stringValue('$.eventSource', '=', 'sts.amazonaws.com'),
      ),
    });
  }

  private setupOrgTrailMonitoringLambda() {

    const monitorFunction = new OrgTrailMonitorFunction(this, 'orgtrail-monitor', {
      environment: {
        SNS_ALERTS_LOW: this.low.topicArn,
        SNS_ALERTS_MEDIUM: this.medium.topicArn,
        SNS_ALERTS_HIGH: this.high.topicArn,
        SNS_ALERTS_CRITICAL: this.critical.topicArn,
      },
    });

    this.low.grantPublish(monitorFunction);
    this.medium.grantPublish(monitorFunction);
    this.high.grantPublish(monitorFunction);
    this.critical.grantPublish(monitorFunction);

    return monitorFunction;
  }

  private getTopicArn(priority: Priority): string {
    const region = Stack.of(this).region;
    const account = Stack.of(this).account;
    return `arn:aws:sns:${region}:${account}:landingzone-platform-events-${priority}`;
  }

}
