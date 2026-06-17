import { Duration, aws_events_targets as targets } from 'aws-cdk-lib';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { Effect, ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { ITopic, Topic } from 'aws-cdk-lib/aws-sns';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { ClockDriftFunction } from './ClockDrift-function';
import { Priority, Statics } from '../statics';

export interface ClockDriftMonitoringProps {
  /**
   * Account name, included in the metric dimension and in any alert sent to slack.
   */
  accountName: string;
  /**
   * Priority of the SNS topic an alert is published to when drift exceeds the margin.
   * @default 'medium'
   */
  priority?: Priority;
  /**
   * Drift, in milliseconds, above which an alert is sent.
   * @default 60_000 (1 minute)
   */
  marginMs?: number;
}

export class ClockDriftMonitoring extends Construct {
  /**
   * Deploys a lambda that, on a schedule, checks whether this account's
   * lambda execution environment clock matches real time (see
   * `ClockDrift.lambda.ts` for the check itself).
   *
   * Every run records a CloudWatch metric with the measured drift, so we can
   * see drift trends over time. An alert is sent through the existing
   * monitoring SNS topic (the same one `EventSubscription` uses) only when
   * drift exceeds the configured margin.
   */
  constructor(scope: Construct, id: string, props: ClockDriftMonitoringProps) {
    super(scope, id);

    const priority = props.priority ?? 'medium';
    const topic = this.topic(priority);

    const role = new Role(this, 'role', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      description: `Role for ClockDriftFunction in ${props.accountName}`,
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    role.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'], // cloudwatch:PutMetricData does not support resource-level permissions
    }));

    const monitorFunction = new ClockDriftFunction(this, 'function', {
      role,
      timeout: Duration.seconds(30),
      environment: {
        SNS_TOPIC_ARN: topic.topicArn,
        MARGIN_MS: String(props.marginMs ?? 60_000),
        ACCOUNT_NAME: props.accountName,
      },
    });
    topic.grantPublish(monitorFunction);

    const topicKeyArn = StringParameter.valueForStringParameter(this, Statics.ssmMpaPlatformTopicKmsKeyArn);
    const topicKey = Key.fromKeyArn(this, 'topic-key', topicKeyArn);
    topicKey.grant(monitorFunction, 'kms:GenerateDataKey*');

    new Rule(this, 'schedule', {
      description: `Run clock drift check for ${props.accountName} every 15 minutes`,
      schedule: Schedule.rate(Duration.minutes(15)),
      targets: [new targets.LambdaFunction(monitorFunction)],
    });

    NagSuppressions.addResourceSuppressions(role, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'Uses the AWS managed AWSLambdaBasicExecutionRole policy for basic CloudWatch Logs permissions, consistent with other lambdas in this repo (e.g. OrgTrailMonitorFunction).',
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'cloudwatch:PutMetricData does not support resource-level permissions; the wildcard is scoped to this single action only.',
      },
    ], true);
  }

  private topic(criticality: Priority): ITopic {
    const arn = StringParameter.valueForStringParameter(this,
      `/landingzone/platform-events/${criticality}-sns-topic-arn`);
    return Topic.fromTopicArn(this, 'topic', arn);
  }
}
