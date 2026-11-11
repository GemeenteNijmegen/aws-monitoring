import { Duration, RemovalPolicy, Tags, aws_apigateway as apigateway } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { SecurityHubActionsReceiverFunction } from './receiver/securityHubActionsReceiver-function';
import { SecurityHubActionsWorkerFunction } from './worker/securityHubActionsWorker-function';

export interface SecurityHubActionsProps {
  readonly api: apigateway.RestApi;
  /**
   * Used to separate environments (as it is all deployed to the same AWS account)
   */
  readonly environment: string;
  /**
   * Branch name of the deployment environment (used by the worker to look up its configuration)
   */
  readonly branchName: string;
  /**
   * Slack user group id whose members may suppress findings
   */
  readonly userGroupId: string;
  readonly slackSecret: ISecret;
  readonly slackBotToken: ISecret;
}

/**
 * Slack interactive endpoint (POST /slack) and SQS-backed worker to
 * suppress Security Hub findings from a Slack message button.
 */
export class SecurityHubActions extends Construct {

  constructor(scope: Construct, id: string, props: SecurityHubActionsProps) {
    super(scope, id);

    const deadLetterQueue = new Queue(this, 'dlq', {
      retentionPeriod: Duration.days(14),
      encryption: QueueEncryption.SQS_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const queue = new Queue(this, 'queue', {
      retentionPeriod: Duration.hours(1),
      visibilityTimeout: Duration.seconds(60),
      encryption: QueueEncryption.SQS_MANAGED,
      deadLetterQueue: { queue: deadLetterQueue, maxReceiveCount: 2 },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const receiver = new SecurityHubActionsReceiverFunction(this, 'receiver', {
      description: 'Security Hub actions receiver (Slack interactions)',
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(5),
      logGroup: this.logGroup('receiver-logs'),
      environment: {
        SLACK_SECRET_ARN: props.slackSecret.secretArn,
        SLACK_BOT_TOKEN_ARN: props.slackBotToken.secretArn,
        QUEUE_URL: queue.queueUrl,
        POWERTOOLS_LOG_LEVEL: 'INFO',
      },
    });
    props.slackSecret.grantRead(receiver);
    props.slackBotToken.grantRead(receiver);
    queue.grantSendMessages(receiver);

    const worker = new SecurityHubActionsWorkerFunction(this, 'worker', {
      description: 'Security Hub actions worker (suppress findings)',
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(30),
      logGroup: this.logGroup('worker-logs'),
      environment: {
        SLACK_BOT_TOKEN_ARN: props.slackBotToken.secretArn,
        USER_GROUP_ID: props.userGroupId,
        BRANCH_NAME: props.branchName,
        POWERTOOLS_LOG_LEVEL: 'INFO',
      },
    });
    props.slackBotToken.grantRead(worker);
    worker.addEventSource(new SqsEventSource(queue, {
      batchSize: 1,
      maxConcurrency: 2,
    }));
    worker.addToRolePolicy(new PolicyStatement({
      actions: ['securityhub:GetFindings', 'securityhub:BatchUpdateFindings'],
      resources: ['*'],
    }));

    const slack = props.api.root.addResource('slack');
    slack.addMethod('POST', new apigateway.LambdaIntegration(receiver));

    Tags.of(this).add('Feature', 'security-hub-actions');
  }

  private logGroup(id: string) {
    return new LogGroup(this, id, {
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}
