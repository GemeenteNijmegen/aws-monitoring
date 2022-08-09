export abstract class Statics {
  static readonly projectName: string = 'aws-monitoring';

  /**
   * Repo information
   */

  static readonly repository: string = 'aws-monitoring';
  static readonly repositoryOwner: string = 'GemeenteNijmegen';

  /**
   * Arn for account-wide monitoring topic
   */
  static readonly ssmMonitoringTopicArn: string = '/account/sns/monitoring-topic-arn';

  /**
   * Slack webhook url for monitoring lambda
   */
  static readonly ssmSlackWebhookUrl: string = '/cdk/aws-monitoring/slack-webhook-url';
}