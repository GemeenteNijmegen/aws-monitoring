import { Duration } from 'aws-cdk-lib';
import { Alarm, Metric } from 'aws-cdk-lib/aws-cloudwatch';
import { Function } from 'aws-cdk-lib/aws-lambda';
import { FilterPattern, LogGroup, SubscriptionFilter } from 'aws-cdk-lib/aws-logs';
import * as destinations from 'aws-cdk-lib/aws-logs-destinations';
import { Construct } from 'constructs';

export interface AssumedRoleAlarmsProps {
  cloudTrailLogGroupName: string;
  logSubscriptionLambdaArn: string;
}

export class DefaultAlarms extends Construct {
  /**
   * Setup alarms for metrics we want to monitor in each account.
   */
  constructor(scope: Construct, id: string, props: AssumedRoleAlarmsProps) {
    super(scope, id);

    this.addConcurrentExecutionsAlarm();
    this.addAccessDeniedAlarm(props.cloudTrailLogGroupName, props.logSubscriptionLambdaArn);
  }

  /**
   * Add an alarm for concurrent executions.
   *
   * Alarm is set to alarm at 20 concurrent
   * executions over all lambdas in the region.
   */
  private addConcurrentExecutionsAlarm() {
    const metric = new Metric({
      metricName: 'ConcurrentExecutions',
      namespace: 'AWS/Lambda',
      statistic: 'Maximum',
      period: Duration.minutes(5),
    });
    new Alarm(this, 'concurrent-executions', {
      metric: metric,
      evaluationPeriods: 1,
      threshold: 20,
    });
  }

  /**
   * Add an alarm for access denied
   *
   * Filtern pattern checks on errorCode UnauthorizedOperation and AccessDenied.
   * Users from Oblivion and Nijmegen are excluded.
   */
  private addAccessDeniedAlarm(cloudTrailLogGroupName: string, logSubscriptionLambdaArn: string) {

    const pattern = FilterPattern.all(
      FilterPattern.any(
        FilterPattern.stringValue('$.errorCode', '=', 'AccessDenied'),
        FilterPattern.stringValue('$.errorCode', '=', 'UnauthorizedOperation'),
      ),
      FilterPattern.stringValue('$.userIdentity.sessionContext.sessionIssuer.userName', '!=', 'oblcc-capacity'),
      FilterPattern.stringValue('$.userIdentity.principalId', '!=', '*:b.withaar'),
      FilterPattern.stringValue('$.userIdentity.principalId', '!=', '*:m.dessing'),
      FilterPattern.stringValue('$.userIdentity.principalId', '!=', '*:m.vandijk'),
      FilterPattern.stringValue('$.userIdentity.principalId', '!=', '*:j.vanderborg'),
    );


    const fn = Function.fromFunctionArn(this, 'LogSubscriptionLambda', logSubscriptionLambdaArn);

    new SubscriptionFilter(this, 'CloudTrailSubscription', {
      destination: new destinations.LambdaDestination(fn),
      filterPattern: pattern,
      logGroup: LogGroup.fromLogGroupName(this, 'CloudTrailLogs', cloudTrailLogGroupName),
    });
  }
}
