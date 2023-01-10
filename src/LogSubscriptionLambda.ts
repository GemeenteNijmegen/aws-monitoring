import path from 'path';
import { aws_lambda, aws_ssm, Duration, Tags } from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { Statics } from './statics';

export interface LogSubscriptionLambdaProps {
  accountName: string;
}

export class LogSubscriptionLambda extends Construct {
  function: aws_lambda.Function;

  /**
   * Creates a lambda function, this function can receive cloudwatch log subscription events
   * and formats them for processing in Slack. The account name is necessary
   * to be able to distinguish messages from multiple accounts in the same Slack channel.
   */
  constructor(scope: Construct, id: string, props: LogSubscriptionLambdaProps) {
    super(scope, id);

    Tags.of(this).add('cdkManaged', 'yes');
    Tags.of(this).add('Project', Statics.projectName);

    this.function = new NodejsFunction(this, 'log-subscription-lambda', {
      memorySize: 256,
      timeout: Duration.seconds(5),
      runtime: Runtime.NODEJS_16_X,
      handler: 'handler',
      entry: path.join(__dirname, 'LogSubscriptionsLambda', 'index.ts'),
      logRetention: RetentionDays.ONE_MONTH,
      depsLockFilePath: path.join(__dirname, 'LogSubscriptionsLambda', 'package-lock.json'),
      bundling: {
        commandHooks: {
          beforeBundling(_inputDir, _outputDir) {
            return ['npm install'];
          },
          beforeInstall(_inputDir, _outputDir) {
            return [];
          },
          // Copy a file so that it will be included in the bundled asset
          afterBundling(inputDir: string, outputDir: string): string[] {
            return [`cp ${inputDir}/template.json ${outputDir}`];
          },
        },
      },
      environment: {
        ACCOUNT_NAME: props.accountName,
        SLACK_WEBHOOK_URL: aws_ssm.StringParameter.valueForStringParameter(this, Statics.ssmSlackWebhookUrl),
        SLACK_WEBHOOK_URL_LOW_PRIO: aws_ssm.StringParameter.valueForStringParameter(this, Statics.ssmSlackWebhookUrlLowPriority),
      },
    });
  }
}
