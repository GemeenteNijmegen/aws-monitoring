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

  static readonly aggregatorEnvironment = {
    account: Statics.gnAggregatorAccount,
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
}
