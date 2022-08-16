import path from 'path';
import { aws_lambda, aws_ssm, Duration, Tags } from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { Statics } from './statics';

export class MonitoringLambda extends Construct {
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
      entry: path.join(__dirname, 'LogLambda', 'index.ts'),
      logRetention: RetentionDays.ONE_MONTH,
      depsLockFilePath: path.join(__dirname, 'LogLambda', 'package-lock.json'),
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
        SLACK_WEBHOOK_URL: aws_ssm.StringParameter.valueForStringParameter(this, Statics.ssmSlackWebhookUrl),
      },
    });
  }
}
