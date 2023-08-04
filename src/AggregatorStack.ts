import { Stack, StackProps } from 'aws-cdk-lib';
import { ITopic, Topic } from 'aws-cdk-lib/aws-sns';
import { LambdaSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { MonitoringFunction } from './monitoringLambda/monitoring-function';
import { Statics } from './statics';
import { SecurityHubOverviewFunction } from './SecurityHubOverviewLambda/SecurityHubOverview-function';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';

interface AggregatorStackProps extends StackProps {
  /**
   * prefix for named params, because multiple copies of this stack can exist in account
   */
  prefix: string;
}

export class AggregatorStack extends Stack {
  /**
   * A stack deployed to the audit account. SNS notifications
   * from all monitored accounts are forwarded to this account,
   * which has a matching set of SNS topics.
   *
   * We subscribe to these topics from our monitoring messaging
   * lambda.
   */
  constructor(scope: Construct, id: string, props: AggregatorStackProps) {
    super(scope, id, props);
    new Notifier(this, 'notifier', { prefix: props.prefix });
  }
}

interface NotifierProps {
  /**
   * Prefix for the monitoring parameter (`dev` in `monitoring-dev-low`)
   */
  prefix: string;
}
class Notifier extends Construct {
  constructor(scope: Construct, id: string, props: NotifierProps) {
    super(scope, id);
    this.setupMonitoringFunction(props.prefix);
    this.setupSecurityHubOverviewFunction(props.prefix);
  }

  setupSecurityHubOverviewFunction(prefix: string){
    const lambda = new SecurityHubOverviewFunction(this, 'securityhub-lambda');
    for (const priority of Statics.monitoringPriorities) {
      const paramValue = StringParameter.valueForStringParameter(this, `${Statics.ssmSlackWebhookUrlPriorityPrefix}-${prefix}-${priority}`);
      lambda.addEnvironment(`SLACK_WEBHOOK_URL_${priority.toUpperCase()}`, paramValue);
    }

    lambda.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'securityhub:GetFindings',
      ],
      resources: ['*'],
    }));

  }

  setupMonitoringFunction(prefix: string){
    const lambda = new MonitoringFunction(this, 'slack-lambda');
    for (const priority of Statics.monitoringPriorities) {
      const paramValue = StringParameter.valueForStringParameter(this, `${Statics.ssmSlackWebhookUrlPriorityPrefix}-${prefix}-${priority}`);
      lambda.addEnvironment(`SLACK_WEBHOOK_URL_${priority.toUpperCase()}`, paramValue);
    }
    this.subscribeLambda(lambda);
  }

  

  /**
   *
   * @param priorities A list of SNS topic priorities to listen to
   * @param lambda
   */
  private subscribeLambda(lambda: MonitoringFunction) {
    const topics = Statics.monitoringPriorities.map(criticality => this.topic(criticality));
    topics.forEach(topic => topic.addSubscription(new LambdaSubscription(lambda)));
  }

  private topic(criticality: string): ITopic {
    const arn = StringParameter.valueForStringParameter(this,
      `/landingzone/platform-events/central-${criticality}-sns-topic-arn`);
    return Topic.fromTopicArn(this, `topic-${criticality}`, arn);
  }
}
