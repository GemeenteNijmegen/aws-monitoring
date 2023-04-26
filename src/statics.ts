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

  /**
   * Arn for account-wide monitoring topic and encryption key
   */
  static readonly ssmMonitoringTopicArn: string = '/account/sns/monitoring-topic-arn';
  static readonly ssmMonitoringKeyArn: string = '/account/kms/monitoring-key-arn';

  /**
   * Slack webhook url for monitoring lambda
   */
  static readonly ssmSlackWebhookUrl: string = '/cdk/aws-monitoring/slack-webhook-url';
  /**
   * Slack webhook url for low priority notifications
   */
  static readonly ssmSlackWebhookUrlLowPriority: string = '/cdk/aws-monitoring/slack-webhook-url-low-prio';
}