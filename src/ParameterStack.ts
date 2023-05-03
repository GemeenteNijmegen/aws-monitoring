import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Statics } from './statics';


export class ParameterStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    for (const priority in Statics.monitoringPriorities) {
      const param = new StringParameter(this, `ssm_slack_${priority}`, {
        stringValue: '-',
        parameterName: `${Statics.ssmSlackWebhookUrlPriorityPrefix}-${priority}`,
      });
      param.applyRemovalPolicy(RemovalPolicy.DESTROY);
    }
  }
}
