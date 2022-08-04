export abstract class Statics {
  static readonly projectName: string = 'mijn-nijmegen';
  static readonly sessionTableName: string = 'mijn-nijmegen-sessions';

  /**
   * Repo information
   */

  static readonly repository: string = 'mijn-nijmegen';
  static readonly repositoryOwner: string = 'GemeenteNijmegen';

  /**
   * Arn for account-wide monitoring topic
   */
  static readonly ssmMonitoringTopicArn: string = '/account/sns/monitoring-topic-arn';
}