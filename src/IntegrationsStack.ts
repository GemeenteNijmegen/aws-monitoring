import {
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  aws_apigateway as apigateway,
} from 'aws-cdk-lib';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { EventInvokeConfig } from 'aws-cdk-lib/aws-lambda';
import { EventBridgeDestination } from 'aws-cdk-lib/aws-lambda-destinations';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
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

    const apiLogging = new LogGroup(this, 'access-logging', {
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.ONE_WEEK,
    });
    apiLogging.grantWrite(new ServicePrincipal('apigateway.amazonaws.com'));

    const api = new apigateway.RestApi(this, 'integration-api-gateway', {
      description: `Monitoring integration endpoints (${props.prefix})`,
      deployOptions: {
        accessLogDestination: new apigateway.LogGroupLogDestination(apiLogging),
        accessLogFormat: apigateway.AccessLogFormat.custom(
          JSON.stringify({
            requestId: '$context.requestId',
            userAgent: '$context.identity.userAgent',
            sourceIp: '$context.identity.sourceIp',
            requestTime: '$context.requestTime',
            requestTimeEpoch: '$context.requestTimeEpoch',
            httpMethod: '$context.httpMethod',
            path: '$context.path',
            status: '$context.status',
            protocol: '$context.protocol',
            responseLength: '$context.responseLength',
            domainName: '$context.domainName',
            errorMessage: '$context.error.message',
            errorType: '$context.error.responseType',
            stage: '$context.stage',
            integrationError: '$context.integration.error',
            integrationStatus: '$context.integration.integrationStatus',
            integrationLatency: '$context.integration.latency',
            integrationRequestId: '$context.integration.requestId',
            integrationErrorMessage: '$context.integrationErrorMessage',
          }),
        ),
      },
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

    const role = new Role(this, 'gateway-role', {
      assumedBy: new ServicePrincipal('apigateway.amazonaws.com'),
      description: 'Role used by apigateway to invoke the slack interactivity lambda async',
    });
    slackFunction.grantInvoke(role);

    const slack = api.root.addResource('slack');
    slack.addMethod('POST', new apigateway.Integration({
      integrationHttpMethod: 'POST',
      type: apigateway.IntegrationType.AWS,
      uri: `arn:aws:apigateway:${Stack.of(this).region}:lambda:path/2015-03-31/functions/${slackFunction.functionArn}/invocations`,
      options: {
        passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_MATCH,
        contentHandling: apigateway.ContentHandling.CONVERT_TO_TEXT,
        integrationResponses: [
          {
            statusCode: '200',
          },
        ],
        requestParameters: {
          'integration.request.header.X-Amz-Invocation-Type': "'Event'",
          'integration.request.header.Content-Type': "'application/x-www-form-urlencoded'"
        },
        credentialsRole: role,
      },
    }));

  }

}