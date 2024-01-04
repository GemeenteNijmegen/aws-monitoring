import { SNSClient } from '@aws-sdk/client-sns';
import { CloudWatchLogsDecodedData } from 'aws-lambda';
import { MonitoringEvent } from './MonitoringEvent';
import { Configuration, MonitoringRule } from '../DeploymentEnvironments';

export class OrgTrailMonitorHandler {

  private monitoringConfiguration: Configuration;
  private client: SNSClient;

  constructor(monitoringConfiguration: Configuration, client: SNSClient) {
    this.client = client;
    this.monitoringConfiguration = monitoringConfiguration;
  }

  async handleLogEvents(events: CloudWatchLogsDecodedData) {
    events.logEvents.forEach(async (event) => {
      try {
        const cloudTrailEvent = JSON.parse(event.message);
        await this.handleLogEvent(cloudTrailEvent);
      } catch (error) {
        console.error('Failed to process OrgTrail event', error, event);
      }
    });
  }

  private async handleLogEvent(cloudTrailEvent: any) {
    const accountId = this.getAccountIdFromEvent(cloudTrailEvent);
    const accountConfiguration = this.lookupAccountConfiguration(accountId);
    const globalRules = this.monitoringConfiguration.globalMonitoringRules ?? [];
    const accountRules = accountConfiguration?.monitoringRules ?? [];
    const applicableRules = [
      ...globalRules,
      ...accountRules,
    ];
    applicableRules.forEach(async (rule) => {
      const message = this.checkEventAgainstRule(cloudTrailEvent, rule);
      if (message) {
        message.addContext('Account', accountConfiguration?.accountName ?? accountId);
        console.info('Event matched, sending message', JSON.stringify(message, null, 4));
        console.info('Marched rule', JSON.stringify(rule, null, 4));
        await message.publishToPlatformTopic(this.client);
      }
    });
  }

  private checkEventAgainstRule(cloudTrailEvent: any, rule: MonitoringRule) {
    if (rule.keyMonitoring && rule.roleMonitoring) {
      throw new Error('Rule roleMonitoring, keyMonitoring and secretMonitoring are mutually exclusive');
    }
    if (rule.keyMonitoring) {
      return this.checkEventAgainstKeyRule(cloudTrailEvent, rule);
    }
    if (rule.roleMonitoring) {
      return this.checkEventAgainstRoleRule(cloudTrailEvent, rule);
    }
    if (rule.secretMonitoring) {
      return this.checkEventAgainstSecretRule(cloudTrailEvent, rule);
    }
    return undefined;
  }

  private checkEventAgainstKeyRule(cloudTrailEvent: any, rule: MonitoringRule) {
    if (cloudTrailEvent.eventSource !== 'kms.amazonaws.com') {
      return false; // Not a KMS event
    }
    if (rule.keyMonitoring?.includeEvents && !rule.keyMonitoring?.includeEvents.includes(cloudTrailEvent.eventName)) {
      return false; // Not an event included in the rule so ignore it
    }
    if (rule.keyMonitoring?.excludeEvents && rule.keyMonitoring?.excludeEvents.includes(cloudTrailEvent.eventName)) {
      return false; // An event that is excluded in the rule so ignore it
    }

    const resource = cloudTrailEvent?.resources?.find((r:any) => r.type === 'AWS::KMS::Key');
    if (!resource) {
      throw Error('No AWS::KMS::Key resource found in event');
    }

    if (resource.ARN === rule.keyMonitoring?.keyArn) {
      const message = new MonitoringEvent();
      message.addTitle(`❗️ KMS key ${cloudTrailEvent.eventName} event detected`);
      message.addMessage(rule.description);
      message.addContext('KeyArn', resource.ARN);
      message.addContext('Principal', this.getUserIdentity(cloudTrailEvent.userIdentity));
      message.setPriority(rule.priority);
      return message;
    }

    return false;
  }

  private checkEventAgainstSecretRule(cloudTrailEvent: any, rule: MonitoringRule) {
    if (cloudTrailEvent.eventSource !== 'secretsmanager.amazonaws.com') {
      return false; // Not a KMS event
    }
    if (rule.secretMonitoring?.includeEvents && !rule.secretMonitoring.includeEvents.includes(cloudTrailEvent.eventName)) {
      return false; // Not an event included in the rule so ignore it
    }
    if (rule.secretMonitoring?.excludeEvents && rule.secretMonitoring.excludeEvents.includes(cloudTrailEvent.eventName)) {
      return false; // An event that is excluded in the rule so ignore it
    }

    const resource = cloudTrailEvent?.requestParameters?.secretId;
    if (!resource) {
      throw Error('No secret arn found in event');
    }

    if (resource.startsWith(rule.secretMonitoring?.secretArn)) {
      const message = new MonitoringEvent();
      message.addTitle(`❗️ ${cloudTrailEvent.eventName} event detected`);
      message.addMessage(rule.description);
      message.addContext('SecretArn', resource);
      message.addContext('Principal', this.getUserIdentity(cloudTrailEvent.userIdentity));
      message.setPriority(rule.priority);
      return message;
    }

    return false;
  }

  private checkEventAgainstRoleRule(cloudTrailEvent: any, rule: MonitoringRule) {
    if (!cloudTrailEvent.eventName?.startsWith('AssumeRole')) {
      return false; // Not a AssumeRole event
    }

    const resource = cloudTrailEvent?.resources?.find((r:any) => r.type === 'AWS::IAM::Role');
    if (!resource) {
      throw Error('No AWS::IAM::Role resource found in event');
    }

    if (resource.ARN?.includes(rule.roleMonitoring?.roleName)) {
      const message = new MonitoringEvent();
      message.addTitle(`❗️ AssumeRole event detected for role ${rule.roleMonitoring?.roleName}`);
      message.addMessage(rule.description);
      message.addContext('Principal', this.getUserIdentity(cloudTrailEvent.userIdentity));
      message.setPriority(rule.priority);
      return message;
    }

    return false;
  }

  /**
   * Get the account specific configuration based on the monitoring configuration provided
   * @param accountId
   * @returns
   */
  private lookupAccountConfiguration(accountId: string) {
    const accountConfiguration = this.monitoringConfiguration.deployToEnvironments.find(config => config.env.account === accountId);
    return accountConfiguration;
  }

  /**
   * Based on the cloud trail event contents, get the account id
   * on which the action is performed.
   * @see https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-event-reference-record-contents.html
   * @param event
   * @returns
   */
  private getAccountIdFromEvent(event: any) {
    if (!event || !event.recipientAccountId) {
      throw new Error('No recipientAccountId found in event');
    }
    return event.recipientAccountId;
  }

  /**
   * Based on a CloudTrail userIdentity object, get the user name or ARN
   * @param userIdentity
   * @returns
   */
  private getUserIdentity(userIdentity: any) {
    if (userIdentity?.type === 'AssumedRole') {
      return userIdentity.sessionContext?.sessionIssuer?.userName ?? userIdentity.arn;
    }
    if (userIdentity?.type === 'AWSService') {
      return userIdentity.invokedBy;
    }
    if (userIdentity?.type === 'AWSAccount') {
      return userIdentity.accountId;
    }
    if (userIdentity?.type === 'IAMUser') {
      return userIdentity.userName;
    }
    if (userIdentity?.type === 'SAMLUser') {
      return userIdentity.userName; // Used for SSO
    }
    return JSON.stringify(userIdentity);
  }
}