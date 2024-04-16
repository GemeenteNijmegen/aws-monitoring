import { Duration } from 'aws-cdk-lib';
import { Alarm, Metric } from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

export class DefaultAlarms extends Construct {
  /**
   * Setup alarms for metrics we want to monitor in each account.
   */
  constructor(scope: Construct, id: string) {
    super(scope, id);
    this.addConcurrentExecutionsAlarm();
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
      alarmName: 'concurrent-executions-high-lvl',
      metric: metric,
      evaluationPeriods: 1,
      threshold: 20,
    });
  }
}
