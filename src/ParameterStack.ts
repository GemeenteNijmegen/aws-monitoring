import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Statics } from './statics';

interface ParameterStackProps extends StackProps {
  /**
   * prefix for named params, because multiple copies of this stack can exist in account
   */
  prefix: string;
}

export class ParameterStack extends Stack {
  constructor(scope: Construct, id: string, props: ParameterStackProps) {
    super(scope, id, props);

    for (const priority of Statics.monitoringPriorities) {
      const param = new StringParameter(this, `ssm_slack_${priority}`, {
        stringValue: '-',
        parameterName: `${Statics.ssmSlackWebhookUrlPriorityPrefix}-${props.prefix}-${priority}`,
      });
      param.applyRemovalPolicy(RemovalPolicy.DESTROY);
    }
  }
}
