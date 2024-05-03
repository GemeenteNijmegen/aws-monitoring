export type Priority = 'low' | 'medium' | 'high' | 'critical';

export interface SpecificPriority {
  default: Priority;
  acceptance?: Priority;
  production?: Priority;
  development?: Priority;
  test?: Priority;
  sandbox?: Priority;
}

export abstract class Statics {
  static readonly projectName: string = 'aws-monitoring';

  /**
   * Repo information
   */

  static readonly repository: string = 'aws-monitoring';
  static readonly repositoryOwner: string = 'GemeenteNijmegen';

  /**
   * Account information
   */
  static readonly gnAuditAccount: string = '302838002127';
  static readonly gnBuildAccount: string = '836443378780';
  static readonly gnAggregatorAccount: string = '302838002127';
  static readonly gnTestAccount: string = '095798249317';

  static readonly aggregatorEnvironment = {
    account: Statics.gnAggregatorAccount,
    region: 'eu-central-1',
  };

  static readonly sandboxEnvironment = {
    account: Statics.gnTestAccount,
    region: 'eu-central-1',
  };

  /**
   * Mpa environment
   */
  static readonly mpaEnvironment = {
    account: '427617903428',
    region: 'eu-central-1',
  };

  /**
   * Priorities for monitoring
   */
  static readonly monitoringPriorities = ['low', 'medium', 'high', 'critical'];

  /**
   * Slack webhook url for low priority notifications
   */
  static readonly ssmSlackWebhookUrlPriorityPrefix: string = '/monitoring/slack-webhook-url';

  /**
   * Prefix for a predictible log query job role name
   */
  static readonly logQueryJobAccessRoleName = 'log-query-job-access-role';

  /**
   * String to uniquely identify a mpa-monitoring-event message
   */
  static readonly mpaMonitoringEventMessageType = 'GemeenteNijmegen/mpa-monitoring-event';

  /**
   * MPA sns platform topic kms key arn (ssm)
   */
  static readonly ssmMpaPlatformTopicKmsKeyArn = '/landingzone/platform-events/kms-key-arn';

  /**
   * Organisation log trail name
   */
  static readonly orgTrailLogGroupName = 'aws-controltower/CloudTrailLogs';


  static readonly ssmTopDeskApiUrl = (env: string) => `/slack-integration/${env}/topdesk/api/url`;
  static readonly ssmTopDeskUsername = (env: string) => `/slack-integration/${env}/topdesk/api/username`;
  static readonly ssmTopDeskDeepLinkUrl = (env: string) => `/slack-integration/${env}/topdesk/deeplink/url`;

  static readonly secretTopDeskPassword = (env: string) => `/slack-integration/${env}/topdesk/api/password`;
  static readonly secretSlackSigningKey = (env: string) => `/slack-integration/${env}/slack/signing-key`;

}
