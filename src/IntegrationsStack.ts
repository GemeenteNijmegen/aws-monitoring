import {
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  aws_apigateway as apigateway,
} from 'aws-cdk-lib';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Function } from 'aws-cdk-lib/aws-lambda';
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

    // Setup the receiving endpoint called by slack (publishes to queue)
    this.setupSlackInteractivityReceiverEndpoint(props, queue, api);

    // Setup the topdesk integration (subscribes to queue)
    const topdeskFunction = this.setupTopdeskIntegrationFunction(props);
    this.subscribeToQueue(queue, topdeskFunction);

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

  setupSlackInteractivityReceiverEndpoint(props: IntegrationsStackProps, queue: Queue, api: apigateway.RestApi) {
    const slackSecret = Secret.fromSecretNameV2(this, 'slack-secret', Statics.secretSlackSigningKey(props.prefix));

    const slackInteractivityFunction = new SlackInteractivityFunction(this, 'slack-interactivity-receiver', {
      environment: {
        SLACK_SECRET_ARN: slackSecret.secretArn,
        QUEUE_URL: queue.queueUrl,
      },
      timeout: Duration.seconds(3),
    });

    queue.grantSendMessages(slackInteractivityFunction);
    slackSecret.grantRead(slackInteractivityFunction);

    const slack = api.root.addResource('slack');
    slack.addMethod('POST', new apigateway.LambdaIntegration(slackInteractivityFunction));

    return slackInteractivityFunction;
  }

  setupTopdeskIntegrationFunction(props: IntegrationsStackProps) {
    const topDeskPassword = Secret.fromSecretNameV2(this, 'topdesk-password', Statics.secretTopDeskPassword(props.prefix));
    const topdeskFunction = new SlackInteractivityFunction(this, 'interactivity-function', {
      environment: {
        TOPDESK_PASSWORD_ARN: topDeskPassword.secretArn,
        TOPDESK_USERNAME: StringParameter.valueForStringParameter(this, Statics.ssmTopDeskUsername(props.prefix)),
        TOPDESK_API_URL: StringParameter.valueForStringParameter(this, Statics.ssmTopDeskApiUrl(props.prefix)),
        TOPDESK_DEEP_LINK_URL: StringParameter.valueForStringParameter(this, Statics.ssmTopDeskDeepLinkUrl(props.prefix)),
      },
      timeout: Duration.seconds(6),
    });
    topDeskPassword.grantRead(topdeskFunction);
    return topdeskFunction;
  }

  subscribeToQueue(queue: Queue, handler: Function) {
    const triggerHandler = new SqsEventSource(queue);
    handler.addEventSource(triggerHandler);
  }

}