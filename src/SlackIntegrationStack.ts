import * as apigatewayv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { SlackInteractivityFunction } from './SlackInteractivityLambda/SlackInteractivity-function';
import { Statics } from './statics';

export class SlackIntegrationStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const slackSecret = Secret.fromSecretNameV2(this, 'slack-secret', Statics.secretSlackSigningKey);
    const topDeskPassword = Secret.fromSecretNameV2(this, 'topdesk-password', Statics.secretTopDeskPassword);

    const slackFunction = new SlackInteractivityFunction(this, 'interactivity-function', {
      environment: {
        SLACK_SECRET_ARN: slackSecret.secretArn,
        TOPDESK_PASSWORD_ARN: topDeskPassword.secretArn,
        TOPDESK_USERNAME: StringParameter.valueForStringParameter(this, Statics.ssmTopDeskUsername),
        TOPDESK_API_URL: StringParameter.valueForStringParameter(this, Statics.ssmTopDeskApiUrl),
        TOPDESK_DEEP_LINK_URL: StringParameter.valueForStringParameter(this, Statics.ssmTopDeskDeepLinkUrl),
      },
    });
    slackSecret.grantRead(slackFunction);
    topDeskPassword.grantRead(slackFunction);

    const api = new apigatewayv2.HttpApi(this, 'integration-api-gateway', {
      description: 'Monitoring integration endpoints',
    });

    api.addRoutes({
      integration: new HttpLambdaIntegration('api-slack', slackFunction),
      path: '/slack',
      methods: [apigatewayv2.HttpMethod.GET],
    });

  }
}