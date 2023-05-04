import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
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

    const topdeksApiUrl = new StringParameter(this, 'ssm1', {
      parameterName: Statics.ssmTopDeskApiUrl,
      stringValue: 'https://test-support.irvn.nl/tas/api',
    });
    topdeksApiUrl.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const topdeskUsername = new StringParameter(this, 'ssm2', {
      parameterName: Statics.ssmTopDeskUsername,
      stringValue: 'AWS-API',
    });
    topdeskUsername.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const topdeskDeepLinkUrl = new StringParameter(this, 'ssm3', {
      parameterName: Statics.ssmTopDeskDeepLinkUrl,
      stringValue: 'https://test-support.irvn.nl/tas/secure/contained/incident?unid=',
    });
    topdeskDeepLinkUrl.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const topDeskPassword = new Secret(this, 'secret1', {
      description: 'topdesk api password',
      secretName: Statics.secretTopDeskPassword,
    });
    topDeskPassword.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const slackSecret = new Secret(this, 'slack-secret', {
      description: 'slack request validation secret',
      secretName: Statics.secretSlackSigningKey,
    });
    slackSecret.applyRemovalPolicy(RemovalPolicy.DESTROY);

  }
}
