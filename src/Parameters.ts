import { RemovalPolicy } from 'aws-cdk-lib';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Statics } from './statics';


export class Parameters extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

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
