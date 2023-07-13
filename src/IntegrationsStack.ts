import {
  Duration,
  Stack,
  StackProps,
  aws_apigateway as apigateway,
} from 'aws-cdk-lib';
import { EventInvokeConfig } from 'aws-cdk-lib/aws-lambda';
import { EventBridgeDestination } from 'aws-cdk-lib/aws-lambda-destinations';
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

    const api = new apigateway.RestApi(this, 'integration-api-gateway', {
      description: `Monitoring integration endpoints (${props.prefix})`,
    });

    this.setupSlackIntegration(props, api);

  }

  setupSlackIntegration(props: IntegrationsStackProps, api: apigateway.RestApi) {
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

    // Setup for async invocation
    new EventInvokeConfig(this, 'async-interactivity-function', {
      function: slackFunction,
      onFailure: new EventBridgeDestination(), // Send to default eventbus
      onSuccess: new EventBridgeDestination(), // Send to default eventbus
    });

    const slack = api.root.addResource('slack');
    slack.addMethod('POST', new apigateway.LambdaIntegration(slackFunction, {
      proxy: false,
      requestParameters: {
        'integration.request.header.x-amz-invocation-type': '\'Event\'', // Single quotes mark a static value...
      },
    }));
  }

}