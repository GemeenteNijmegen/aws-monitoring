import { Duration } from 'aws-cdk-lib';
import { Alarm, Metric } from 'aws-cdk-lib/aws-cloudwatch';
import { FilterPattern, LogGroup, MetricFilter } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface AssumedRoleAlarmsProps {
  cloudTrailLogGroupName: string;
}

export class DefaultAlarms extends Construct {
  /**
   * Setup alarms for metrics we want to monitor in each account.
   */
  constructor(scope: Construct, id: string, props: AssumedRoleAlarmsProps) {
    super(scope, id);

    this.addConcurrentExecutionsAlarm();
    this.addAccessDeniedAlarm(props.cloudTrailLogGroupName);
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
  private addAccessDeniedAlarm(cloudTrailLogGroupName: string) {

    const pattern = FilterPattern.all(
      FilterPattern.any(
        FilterPattern.stringValue('$.errorCode', '=', 'AccessDenied'),
        FilterPattern.stringValue('$.errorCode', '=', 'UnauthorizedOperation'),
      ),
      FilterPattern.stringValue('$.userIdentity.sessionContext.sessionIssuer.userName', '!=', 'oblcc-capacity'),
      FilterPattern.any(
        FilterPattern.stringValue('$.userIdentity.principalId', '!=', '*:b.withaar'),
        FilterPattern.stringValue('$.userIdentity.principalId', '!=', '*:m.dessing'),
        FilterPattern.stringValue('$.userIdentity.principalId', '!=', '*:m.vandijk'),
        FilterPattern.stringValue('$.userIdentity.principalId', '!=', '*:j.vanderborg'),
      ),
    );

    new MetricFilter(this, 'MetricFilter', {
      logGroup: LogGroup.fromLogGroupName(this, 'cloudtrail', cloudTrailLogGroupName),
      metricName: 'AccessDeniedCustom',
      metricNamespace: 'CloudTrailMetrics',
      filterPattern: pattern,
    });

    const metric = new Metric({
      metricName: 'AccessDeniedCustom',
      namespace: 'CloudTrailMetrics',
      statistic: 'Maximum',
      period: Duration.minutes(5),
    });

    new Alarm(this, 'access-denied', {
      metric: metric,
      evaluationPeriods: 1,
      threshold: 1,
    });
  }
}
