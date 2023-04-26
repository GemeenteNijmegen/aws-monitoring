import { aws_lambda, aws_ssm, Duration, Tags } from 'aws-cdk-lib';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { MonitoringFunction } from './monitoringLambda/monitoring-function';
import { Statics } from './statics';

export interface MonitoringLambdaProps {
  accountName: string;
}

export class MonitoringLambda extends Construct {
  function: aws_lambda.Function;

  /**
   * Creates a lambda function, this function can receive SNS events
   * and formats them for processing in Slack. The account name is necessary
   * to be able to distinguish messages from multiple accounts in the same Slack channel.
   */
  constructor(scope: Construct, id: string, props: MonitoringLambdaProps) {
    super(scope, id);

    Tags.of(this).add('cdkManaged', 'yes');
    Tags.of(this).add('Project', Statics.projectName);

    this.function = new MonitoringFunction(this, 'log-lambda', {
      memorySize: 256,
      timeout: Duration.seconds(5),
      logRetention: RetentionDays.ONE_MONTH,
      environment: {
        ACCOUNT_NAME: props.accountName,
        SLACK_WEBHOOK_URL: aws_ssm.StringParameter.valueForStringParameter(this, Statics.ssmSlackWebhookUrl),
        SLACK_WEBHOOK_URL_LOW_PRIO: aws_ssm.StringParameter.valueForStringParameter(this, Statics.ssmSlackWebhookUrlLowPriority),
      },
    });

    /**
     * Allow invocation from cloudwatch logs (log subscription filter)
     */
    this.function.addPermission('log-subscription-allow-invoke', {
      principal: new ServicePrincipal('logs.amazonaws.com'),
    });

  }
}
