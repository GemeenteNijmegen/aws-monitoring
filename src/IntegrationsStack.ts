import * as apigatewayv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { SlackInteractivityFunction } from './SlackInteractivityLambda/SlackInteractivity-function';
import { Statics } from './statics';

export interface IntegrationsStackProps extends StackProps {
  /**
   * Environment prefix to use in parameters
   */
  prefix: string;
}

export class IntegrationsStack extends Stack {

  constructor(scope: Construct, id: string, props: IntegrationsStackProps) {
    super(scope, id, props);

    const api = new apigatewayv2.HttpApi(this, 'integration-api-gateway', {
      description: 'Monitoring integration endpoints',
    });

    this.setupSlackIntegration(props, api);

  }

  setupSlackIntegration(props: IntegrationsStackProps, api: apigatewayv2.HttpApi) {
    const slackSecret = Secret.fromSecretNameV2(this, 'slack-secret', Statics.secretSlackSigningKey(props.prefix));
    const topDeskPassword = Secret.fromSecretNameV2(this, 'topdesk-password', Statics.secretTopDeskPassword(props.prefix));

    const slackFunction = new SlackInteractivityFunction(this, 'interactivity-function', {
      environment: {
        SLACK_SECRET_ARN: slackSecret.secretArn,
        TOPDESK_PASSWORD_ARN: topDeskPassword.secretArn,
        TOPDESK_USERNAME: StringParameter.valueForStringParameter(this, Statics.ssmTopDeskUsername(props.prefix)),
        TOPDESK_API_URL: StringParameter.valueForStringParameter(this, Statics.ssmTopDeskApiUrl(props.prefix)),
        TOPDESK_DEEP_LINK_URL: StringParameter.valueForStringParameter(this, Statics.ssmTopDeskDeepLinkUrl(props.prefix)),
      },
      timeout: Duration.seconds(6),
    });
    slackSecret.grantRead(slackFunction);
    topDeskPassword.grantRead(slackFunction);

    api.addRoutes({
      integration: new HttpLambdaIntegration('api-slack', slackFunction),
      path: '/slack',
      methods: [apigatewayv2.HttpMethod.POST],
    });
  }

}