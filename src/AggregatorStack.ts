import { Duration, Stack, StackProps, aws_events_targets as targets } from 'aws-cdk-lib';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { ITopic, Topic } from 'aws-cdk-lib/aws-sns';
import { LambdaSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { getConfiguration } from './DeploymentEnvironments';
import { LogQueryJob } from './LogQueryJob';
import { MonitoringFunction } from './monitoringLambda/monitoring-function';
import { SecurityHubOverviewFunction } from './SecurityHubOverviewLambda/SecurityHubOverview-function';
import { Statics } from './statics';

interface AggregatorStackProps extends StackProps {
  /**
   * prefix for named params, because multiple copies of this stack can exist in account
   */
  prefix: string;

  /**
   * Branch name of the branch that is deployed
   */
  branchName: string;
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
    new Notifier(this, 'notifier', { prefix: props.prefix, branchName: props.branchName });
  }
}

interface NotifierProps {
  /**
   * Prefix for the monitoring parameter (`dev` in `monitoring-dev-low`)
   */
  prefix: string;
  /**
   * Branch name of the branch that is deployed
   */
  branchName: string;
}
class Notifier extends Construct {
  constructor(scope: Construct, id: string, props: NotifierProps) {
    super(scope, id);
    this.setupMonitoringFunction(props.prefix, props.branchName);
    this.setupSecurityHubOverviewFunction(props.prefix, props.branchName);
    this.setupLogQueryJob(props.prefix, props.branchName);
  }

  setupSecurityHubOverviewFunction(prefix: string, branchName: string) {

    // Create the lambda and inject the webhook urls
    const lambda = new SecurityHubOverviewFunction(this, 'securityhub-lambda', {
      description: `SecurityHub Overview Lambda for ${prefix}`,
      timeout: Duration.minutes(5),
      environment: {
        BRANCH_NAME: branchName,
      },
    });
    for (const priority of Statics.monitoringPriorities) {
      const paramValue = StringParameter.valueForStringParameter(this, `${Statics.ssmSlackWebhookUrlPriorityPrefix}-${prefix}-${priority}`);
      lambda.addEnvironment(`SLACK_WEBHOOK_URL_${priority.toUpperCase()}`, paramValue);
    }

    // Trigger the overview lambda on a schedule
    new Rule(this, 'SecurityHubOverviewRule', {
      schedule: Schedule.cron({
        hour: '6',
        minute: '3',
      }),
      targets: [
        new targets.LambdaFunction(lambda, {
          retryAttempts: 2,
        }),
      ],
    });

    // Allow the overview lambda to list the findings in securityhub
    lambda.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'securityhub:GetFindings',
      ],
      resources: ['*'],
    }));

  }

  setupMonitoringFunction(prefix: string, branchName: string) {
    const lambda = new MonitoringFunction(this, 'slack-lambda', {
      environment: {
        BRANCH_NAME: branchName,
      },
      description: `Slack notification lambda (${prefix})`,
    });
    for (const priority of Statics.monitoringPriorities) {
      const paramValue = StringParameter.valueForStringParameter(this, `${Statics.ssmSlackWebhookUrlPriorityPrefix}-${prefix}-${priority}`);
      lambda.addEnvironment(`SLACK_WEBHOOK_URL_${priority.toUpperCase()}`, paramValue);
    }
    this.subscribeLambda(lambda);
  }

  setupLogQueryJob(prefix: string, branchName: string) {
    new LogQueryJob(this, 'log-query-job', {
      prefix: prefix,
      branchName: branchName,
      deployToEnvironments: getConfiguration(branchName).deployToEnvironments,
    });
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
