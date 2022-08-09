import path from 'path';
import { aws_events_targets, aws_kms, aws_lambda, aws_sns, aws_ssm, Duration, Environment, Stack, StackProps, Stage, StageProps, Tags } from 'aws-cdk-lib';
import { Rule } from 'aws-cdk-lib/aws-events';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { LambdaSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { Statics } from './statics';

export interface MonitoringTargetStageProps extends StageProps {
  deployToEnvironments: { name: string; env: Environment }[];
}

export class MonitoringTargetStage extends Stage {
  /**
	 * The monitoring target stage creates a stack containing
	 * a monitoring topic, which can be used account-wide as a target
	 * for monitoring notifications.
	 */
  constructor(scope: Construct, id: string, props: MonitoringTargetStageProps) {
    super(scope, id, props);
    Tags.of(this).add('cdkManaged', 'yes');
    Tags.of(this).add('Project', Statics.projectName);
    props.deployToEnvironments.forEach(environment => {
      new MonitoringTargetStack(this, `monitoring-${environment.name}`, { env: environment.env });
    });
  }
}

export class MonitoringTargetStack extends Stack {
  /**
	 * Create a new stack containing all resources required for the monitoring
	 * stage.
	 *
	 * The monitoring topic has a lambda subscriber responsible for
	 * formatting and sending relevant notifications to a slack channel.
	 */
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    Tags.of(this).add('cdkManaged', 'yes');
    Tags.of(this).add('Project', Statics.projectName);

    const key = this.kmskey();
    const topic = this.topic(key);

    this.subscribeToAccountwideAlarmEvents(topic);
    this.AddLambdaSubscriber(topic);

    this.suppressNagging();
  }

  kmskey() {
    const key = new aws_kms.Key(this, 'kmskey', {
      enableKeyRotation: true,
      description: 'encryption key for monitoring stack for this account',
      alias: 'account/kms/monitoring-key',
    });
    return key;
  }

  /**
	 * Create an SNS topic and a parameter exporting the topic arn.
	 *
	 * @returns aws_sns.Topic the newly created topic
	 */
  topic(key: aws_kms.Key) {
    const topic = new aws_sns.Topic(this, 'sns-topic', {
      displayName: 'Account-wide monitoring topic',
      masterKey: key,
    });
    new aws_ssm.StringParameter(this, 'topic-arn', {
      stringValue: topic.topicArn,
      parameterName: Statics.ssmMonitoringTopicArn,
    });
    return topic;
  }

  /**
	 * Creates a new lambda function and subscribes it to a topic.
	 *
	 * This lambda is responsible for formatting events posted to SNS
	 * and sending notifications to a slack webhook.
	 *
	 * @param topic the SNS topic the lambda should be subscribed to
	 */
  AddLambdaSubscriber(topic: aws_sns.Topic) {
    const monitoringLambda = new MonitoringLambda(this, 'log-lambda');
    topic.addSubscription(new LambdaSubscription(monitoringLambda.function));
  }

  private subscribeToAccountwideAlarmEvents(topic: aws_sns.Topic) {
    new Rule(this, 'alarm-state-changed', {
      description: 'Send all alarm state change notifications to SNS',
      targets: [new aws_events_targets.SnsTopic(topic)],
      eventPattern: {
        source: ['aws.cloudwatch'],
        detailType: ['CloudWatch Alarm State Change'],
      },
    });
  }

  private suppressNagging() {
    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Lambda needs to be able to create and write to a log group',
          appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
        },
      ],
      true,
    );

    /**
		 * Deze is eigenlijk te breed, accepteert nu alle resources met wildcard in de stack. Voor zover ik kan vinden is
		 * het niet specifieker in te richten. Ander nadeel van deze suppression is dat het op alle resources met wildcard
		 * dit als metadata toevoegt.
		 */
    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Setting a log retention policy on a lambda creates a log group via a custom resource, which has a wildcard permission for creating log groups.',
          appliesTo: ['Resource::*'],
        },
      ],
      true,
    );
  }
}

class MonitoringLambda extends Construct {
  function: aws_lambda.Function;
  constructor(scope: Construct, id: string) {
    super(scope, id);

    Tags.of(this).add('cdkManaged', 'yes');
    Tags.of(this).add('Project', Statics.projectName);

    this.function = new NodejsFunction(this, 'log-lambda', {
      memorySize: 256,
      timeout: Duration.seconds(5),
      runtime: Runtime.NODEJS_16_X,
      handler: 'handler',
      entry: path.join(__dirname, 'LogLambda/index.js'),
      logRetention: RetentionDays.ONE_MONTH,
    });
  }

}