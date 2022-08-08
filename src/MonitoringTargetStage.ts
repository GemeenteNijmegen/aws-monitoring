import path from 'path';
import { aws_sns, aws_ssm, Duration, Environment, Stack, StackProps, Stage, StageProps, Tags } from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LambdaSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
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

    new MonitoringTargetStack(this, 'monitoring');
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
    const topic = this.topic();
    this.AddLambdaSubscriber(topic);
  }

  /**
	 * Create an SNS topic and a parameter exporting the topic arn.
	 *
	 * @returns aws_sns.Topic the newly created topic
	 */
  topic() {
    const topic = new aws_sns.Topic(this, 'sns-topic', {
      displayName: 'Account-wide monitoring topic',
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
    const logLambda = new NodejsFunction(this, 'log-lambda', {
      memorySize: 256,
      timeout: Duration.seconds(5),
      runtime: Runtime.NODEJS_16_X,
      handler: 'handler',
      entry: path.join(__dirname, 'LogLambda/index.js'),
    });
    topic.addSubscription(new LambdaSubscription(logLambda));
  }
}