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
import { SecurityHubActions } from './securityHubActions/SecurityHubActions';

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
  /**
   * Slack user group id allowed to suppress Security Hub findings from Slack.
   * When set, the POST /slack endpoint and worker are deployed (requires deployAuditSlackbot).
   */
  securityHubActionsUserGroupId?: string;
  /**
   * Branch name of the deployment environment (passed to the Security Hub actions worker)
   * @default main
   */
  branchName?: string;
}

export class IntegrationsStack extends Stack {

  constructor(scope: Construct, id: string, props: IntegrationsStackProps) {
    super(scope, id, props);

    if (props.securityHubActionsUserGroupId && props.deployAuditSlackbot !== true) {
      throw new Error('securityHubActionsUserGroupId requires deployAuditSlackbot');
    }

    const api = this.setupApi(props);

    if (props.deployAuditSlackbot === true) {
      const auditSupport = new AuditSupport(this, 'audit-support', {
        api,
        environment: props.prefix,
      });

      if (props.securityHubActionsUserGroupId) {
        new SecurityHubActions(this, 'security-hub-actions', {
          api,
          environment: props.prefix,
          branchName: props.branchName ?? 'main',
          userGroupId: props.securityHubActionsUserGroupId,
          slackSecret: auditSupport.slackSecret,
          slackBotToken: auditSupport.slackBotToken,
        });
      }
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
        methodOptions: props.securityHubActionsUserGroupId ? {
          '/slack/POST': { throttlingRateLimit: 5, throttlingBurstLimit: 10 },
        } : undefined,
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