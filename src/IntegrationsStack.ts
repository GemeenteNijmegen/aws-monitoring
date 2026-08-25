import {
  RemovalPolicy,
  Stack,
  StackProps,
  aws_apigateway as apigateway,
} from 'aws-cdk-lib';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { AuditSupport } from './audit/AuditSupport';

export interface IntegrationsStackProps extends StackProps {
  /**
   * Environment prefix to use in parameters
   */
  prefix: string;
  /**
   * Deploy audit slackbot
   * @default false
   */
  deployAuditSlackbot?: boolean;
}

export class IntegrationsStack extends Stack {

  constructor(scope: Construct, id: string, props: IntegrationsStackProps) {
    super(scope, id, props);

    const api = this.setupApi(props);

    if (props.deployAuditSlackbot === true) {
      new AuditSupport(this, 'audit-support', {
        api,
        environment: props.prefix,
      });
    }

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

}