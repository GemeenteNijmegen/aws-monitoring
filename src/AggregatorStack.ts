import { Stack, StackProps } from 'aws-cdk-lib';
import { ITopic, Topic } from 'aws-cdk-lib/aws-sns';
import { LambdaSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { MonitoringFunction } from './monitoringLambda/monitoring-function';
import { Parameters } from './Parameters';
import { Statics } from './statics';


export class AggregatorStack extends Stack {
  /**
   * A stack deployed to the audit account. SNS notifications
   * from all monitored accounts are forwarded to this account,
   * which has a matching set of SNS topics.
   *
   * We subscribe to these topics from our monitoring messaging
   * lambda.
   */
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    const parameters = new Parameters(this, 'parameters');
    const lambda = new MonitoringFunction(this, 'slack-lambda', {
      environment: {
        SLACK_WEBHOOK_URL: StringParameter.valueForStringParameter(this, Statics.ssmSlackWebhookUrl),
        SLACK_WEBHOOK_URL_LOW_PRIO: StringParameter.valueForStringParameter(this, Statics.ssmSlackWebhookUrlLowPriority),
      },
    });
    lambda.node.addDependency(parameters);

    //TODO: Start listening to all criticality levels
    const topic = this.topic('low');
    topic.addSubscription(new LambdaSubscription(lambda));
  }

  private topic(criticality: string): ITopic {
    const arn = StringParameter.valueForStringParameter(this,
      `/landingzone/platform-events/central-${criticality}-sns-topic-arn`);
    return Topic.fromTopicArn(this, 'topic', arn);
  }
}
