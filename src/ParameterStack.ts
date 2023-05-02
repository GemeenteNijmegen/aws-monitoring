import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Statics } from './statics';


export class ParameterStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const slackParam = new StringParameter(this, 'ssm_slack_1', {
      stringValue: '-',
      parameterName: Statics.ssmSlackWebhookUrl,
    });
    slackParam.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const slackParamLowPriority = new StringParameter(this, 'ssm_slack_2', {
      stringValue: '-',
      parameterName: Statics.ssmSlackWebhookUrlLowPriority,
    });
    slackParamLowPriority.applyRemovalPolicy(RemovalPolicy.DESTROY);
  }
}
