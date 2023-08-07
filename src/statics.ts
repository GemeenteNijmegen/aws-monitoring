export type Priority = 'low' | 'medium' | 'high' | 'critical';

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
  static readonly gnBuildAccount: string = '836443378780';
  static readonly gnAggregatorAccount: string = '302838002127';
  static readonly gnTestAccount: string = '095798249317';
  static readonly gnMpa: string = '427617903428';

  static readonly aggregatorEnvironment = {
    account: Statics.gnAggregatorAccount,
    region: 'eu-central-1',
  };

  static readonly mpaEnvironment = {
    account: Statics.gnMpa,
    region: 'eu-central-1',
  };

  /**
   * Prefix for a predictible log query job role name
   */
  static readonly logQueryJobRoleNamePrefix = 'log-query-job-role-';

  /**
   * MPA orgtrail
   */
  static readonly orgTrailLogGroupName = 'aws-controltower/CloudTrailLogs';
  static readonly assumedRolesToAlarmOn: {[key: string]: Priority} = {
    'lz-platform-operator-ep': 'high',
    'landingzone-break-glass': 'critical',
  };

  /**
   * Priorities for monitoring
   */
  static readonly monitoringPriorities = ['low', 'medium', 'high', 'critical'];

  /**
   * Slack webhook url for low priority notifications
   */
  static readonly ssmSlackWebhookUrlPriorityPrefix: string = '/monitoring/slack-webhook-url';


  static readonly ssmTopDeskApiUrl = (env: string) => `/slack-integration/${env}/topdesk/api/url`;
  static readonly ssmTopDeskUsername = (env: string) => `/slack-integration/${env}/topdesk/api/username`;
  static readonly ssmTopDeskDeepLinkUrl = (env: string) => `/slack-integration/${env}/topdesk/deeplink/url`;

  static readonly secretTopDeskPassword = (env: string) => `/slack-integration/${env}/topdesk/api/password`;
  static readonly secretSlackSigningKey = (env: string) => `/slack-integration/${env}/slack/signing-key`;

}
