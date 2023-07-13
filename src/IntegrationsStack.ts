import {
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  aws_apigateway as apigateway,
} from 'aws-cdk-lib';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { EventInvokeConfig, Function } from 'aws-cdk-lib/aws-lambda';
import { EventBridgeDestination } from 'aws-cdk-lib/aws-lambda-destinations';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Queue } from 'aws-cdk-lib/aws-sqs';
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

    const queue = this.setupQueue();
    const api = this.setupApi(props);
    const slackFunction = this.setupSlackIntegrationFunction(props);
    this.setupQueueIntegration(api, queue);
    this.subscribeToQueue(queue, slackFunction);

  }

  setupApi(props: IntegrationsStackProps) {
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
    return api;
  }

  setupQueue() {
    const queue = new Queue(this, 'interactivity-queue', {
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    return queue;
  }

  setupSlackIntegrationFunction(props: IntegrationsStackProps) {
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

    return slackFunction;
  }

  setupQueueIntegration(api: apigateway.RestApi, queue: Queue) {

    // Setup role for the integration
    const role = new Role(this, 'gateway-role', {
      assumedBy: new ServicePrincipal('apigateway.amazonaws.com'),
      description: 'Role used by apigateway to invoke the slack interactivity lambda async',
    });
    queue.grantSendMessages(role);

    // Setup the queue integration
    const integration = new apigateway.AwsIntegration({
      service: 'sqs',
      proxy: true,
      path: `${Stack.of(this).account}/${queue.queueName}`,
      integrationHttpMethod: 'POST',
      options: {
        credentialsRole: role,
        requestParameters: {
          'integration.request.header.Content-Type': '\'application/x-www-form-urlencoded\'',
        },
        requestTemplates: {
          'application/x-www-form-urlencoded': '\
              Action=SendMessage## \
              &MessageBody=$input.body## \
              &MessageAttributes.1.Name=slackTimestamp ## x-slack-request-timestamp \
              &MessageAttributes.1.Value.DataType=String## \
              &MessageAttributes.1.Value.StringValue=$input.params.header.x-slack-request-timestamp## \
              &MessageAttributes.1.Name=slackSignature##x-slack-signature  \
              &MessageAttributes.1.Value.DataType=String## \
              &MessageAttributes.1.Value.StringValue=$input.params.header.x-slack-signature##',
        },
        integrationResponses: [
          {
            statusCode: '400',
          },
          {
            statusCode: '200',
          },
          {
            statusCode: '500',
          },
        ],
      },
    });

    const slack = api.root.addResource('slack');
    slack.addMethod('POST', integration, {
      methodResponses: [
        {
          statusCode: '400',
        },
        {
          statusCode: '200',
        },
        {
          statusCode: '500',
        },
      ],
    });

  }

  subscribeToQueue(queue: Queue, handler: Function) {
    const triggerHandler = new SqsEventSource(queue);
    handler.addEventSource(triggerHandler);
  }

}