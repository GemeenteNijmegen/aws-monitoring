import { CloudWatchLogsDecodedData } from 'aws-lambda';
import { Message } from './Message';
import { SlackMessage } from './SlackMessage';
import { getEventType } from './SnsEventHandler';
import { Configuration, getConfiguration } from '../DeploymentEnvironments';

/**
 * Abstract class for formatting differnt types of events
 * the formattedMesssage method returns a Message object
 */
export abstract class MessageFormatter<T> {

  event: T;
  account: string;
  priority: string;
  configuration: Configuration;

  constructor(event: T, account: string, priority: string) {
    this.event = event;
    this.account = account;
    this.priority = priority;
    this.configuration = getConfiguration(process.env.BRANCH_NAME ?? 'main-new-lz');
  }

  formattedMessage(): SlackMessage {
    const message = new Message();
    this.constructMessage(message);
    return this.addMessageInteractions(message);
  }

  abstract constructMessage(message: Message): Message;

  addMessageInteractions(message: Message) {
    // Topdesk create ticket interaction
    const topdeskMessage = message.getTopDeskIncident();
    const slackMessage = message.getSlackMessage();
    slackMessage.addButton('Create TopDesk ticket', 'create-topdesk-ticket', topdeskMessage.getIncident(this.priority));
    return slackMessage;
  }

  /**
   * Use the deployment environments in this project
   * to retreive the account name
   * @param account
   * @returns
   */
  lookupAccountName(account: string) {
    const config = getConfiguration(process.env.BRANCH_NAME ?? 'main-new-lz');
    const monitoringConfig = config.deployToEnvironments.find(deploymentEnv => deploymentEnv.env.account == account);
    return monitoringConfig?.accountName ?? account;
  }

}

export class AlarmMessageFormatter extends MessageFormatter<any> {
  constructMessage(message: Message): Message {
    let alarmInfo;
    alarmInfo = this.getAlarmInfo(alarmInfo);
    if (alarmInfo.type == 'IN_ALARM') {
      message.addHeader(`❗️ Alarm: ${alarmInfo.alarmName}`);
    } else {
      message.addHeader(`✅ Alarm ended: ${alarmInfo.alarmName}`);
    }

    message.addContext({
      type: alarmInfo.eventType,
      account: this.lookupAccountName(alarmInfo.account),
    });
    message.addSection(alarmInfo.reason);
    const target = alarmInfo.target;
    message.addLink('Bekijk alarm', target);
    return message;
  }

  private getAlarmInfo(alarmInfo: any) {
    if (this.event?.detail?.alarmName) {
      alarmInfo = {
        alarmName: this.event.detail.alarmName,
        type: (this.event?.detail?.state?.value == 'OK' || this.event?.detail?.state?.value == 'INSUFFICIENT_DATA') ? 'ENDED' : 'IN_ALARM',
        eventType: getEventType(this.event),
        account: this.account,
        reason: this.event?.detail.state.reason,
        target: `https://${this.event?.region}.console.aws.amazon.com/cloudwatch/home?region=${this.event?.region}#alarmsV2:alarm/${encodeURIComponent(this.event.detail.alarmName)}`,
      };
    } else if (this.event?.AlarmName) {

      // Events from custom metrics may arrive without account dimension, in that case use the AWSAccountId field from the event.
      const accountDimension = this.event.Trigger.Dimensions[0];
      let account = 'unknown';
      if (accountDimension) {
        account = accountDimension?.value;
      } else if ( this.event.AWSAccountId ) {
        account = this.event.AWSAccountId;
      }

      alarmInfo = {
        alarmName: this.event.AlarmName,
        type: (this.event?.NewStateValue == 'OK' || this.event?.NewStateValue == 'INSUFFICIENT_DATA') ? 'ENDED' : 'IN_ALARM',
        eventType: 'Alarm state change',
        account: account,
        reason: this.event?.NewStateReason,
        target: `https://eu-central-1.console.aws.amazon.com/cloudwatch/home?region=eu-central-1#alarmsV2:alarm/${encodeURIComponent(this.event.AlarmName)}`,
      };
    }
    return alarmInfo;
  }
}

export class EcsMessageFormatter extends MessageFormatter<any> {
  constructMessage(message: Message): Message {
    const status = this.event?.detail?.lastStatus;
    const desiredStatus = this.event?.detail?.desiredStatus;
    const containerString = this.event?.detail?.containers.map((container: { name: any; lastStatus: any }) => `${container.name} (${container.lastStatus})`).join('\\n - ');
    const clusterName = this.event?.detail?.clusterArn.split('/').pop();
    const target = `https://${this.event?.region}.console.aws.amazon.com/ecs/home?region=${this.event?.region}#/clusters/${clusterName}/services`;

    if (status != desiredStatus) {
      message.addHeader(`❗️ ECS Task not in desired state (state ${status}, desired ${desiredStatus})`);
    } else {
      message.addHeader(`✅ ECS Task in desired state (${status})`);
    }
    message.addContext({
      type: `${getEventType(this.event)}, cluster ${clusterName}`,
      account: this.lookupAccountName(this.account),
    });
    message.addSection(`Containers involved: \\n - ${containerString}`);
    message.addLink('Bekijk cluster', target);
    return message;
  }
}

export class DevopsGuruMessageFormatter extends MessageFormatter<any> {
  constructMessage(message: Message): Message {
    if (this.event?.detail?.insightSeverity == 'high') {
      message.addHeader('❗️ DevopsGuru Insight');
    } else {
      message.addHeader('DevopsGuru Insight');
    }
    message.addContext({
      type: `${getEventType(this.event)}`,
      account: this.lookupAccountName(this.account),
    });
    message.addSection(this.event?.detail?.insightDescription);
    message.addLink('Bekijk insight', this.event?.detail?.insightUrl);
    return message;
  }
}


export class CertificateExpiryFormatter extends MessageFormatter<any> {
  constructMessage(message: Message): Message {
    message.addHeader('❗️ Certificate nearing expiration');
    message.addContext({
      type: `${getEventType(this.event)}`,
      account: this.lookupAccountName(this.account),
    });
    message.addSection(`${this.event?.detail?.CommonName} verloopt over *${this.event?.detail?.DaysToExpiry} dagen.`);
    message.addLink('Bekijk certificaten', 'https://eu-west-1.console.aws.amazon.com/acm/home?region=eu-west-1');
    return message;
  }
}


export class Ec2MessageFormatter extends MessageFormatter<any> {
  constructMessage(message: Message): Message {

    const status = this.event?.detail?.state;
    message.addHeader(`EC2 instance ${status}`);
    message.addContext({
      type: `${getEventType(this.event)}`,
      account: this.lookupAccountName(this.account),
    });
    message.addSection(`Instance id: ${this.event?.detail?.['instance-id']}`);

    const target = `https://${this.event?.region}.console.aws.amazon.com/ec2/v2/home?region=${this.event?.region}#InstanceDetails:instanceId=${this.event?.detail?.['instance-id']}`;
    message.addLink('Bekijk instance', target);

    return message;
  }
}

export class CodePipelineFormatter extends MessageFormatter<any> {
  constructMessage(message: Message): Message {
    switch (this.event?.detail?.state) {
      case 'STARTED':
        message.addHeader(`⏳ Pipeline started: ${this.event.detail.pipeline}`);
        break;
      case 'FAILED':
        message.addHeader(`❗️ Codepipeline failed: ${this.event.detail.pipeline}`);
        break;
      case 'STOPPED':
        message.addHeader(`❌ Codepipeline stopped: ${this.event.detail.pipeline}`);
        break;
      case 'SUCCEEDED':
        message.addHeader(`✅ Pipeline succeeded: ${this.event.detail.pipeline}`);
        break;
      case 'SUPERSEDED':
        message.addHeader(`🔁 Pipeline superseded: ${this.event.detail.pipeline}`);
        break;
      default:
        message.addHeader(`Pipeline ${this.event.detail.state}: ${this.event.detail.pipeline}`);
        break;
    }

    message.addContext({
      type: getEventType(this.event),
      account: this.lookupAccountName(this.account),
    });

    message.addSection('Codepipeline state changed');
    const target = `https://${this.event?.region}.console.aws.amazon.com/codesuite/codepipeline/pipelines/${this.event?.detail?.pipeline}/view`;
    message.addLink('Bekijk codepipeline', target);

    return message;
  }
}

export class HealthDashboardFormatter extends MessageFormatter<any> {
  constructMessage(message: Message): Message {
    message.addHeader(`Health Dashboard alert: ${this.event?.detail?.eventTypeCode}`);
    message.addContext({
      type: `${getEventType(this.event)}`,
      account: this.lookupAccountName(this.account),
    });
    message.addSection(`${this.event?.detail?.eventDescription.map((event: { latestDescription: string }) => `${event.latestDescription.replace('\\n', '\n') }`)}`);
    message.addLink('Bekijk Health Dashboard', 'https://health.aws.amazon.com/health/home#/account/dashboard/');
    return message;
  }
}

export class InspectorFindingFormatter extends MessageFormatter<any> {
  constructMessage(message: Message): Message {
    message.addHeader(`Inspector Finding alert: ${this.event?.detail?.title}`);
    message.addContext({
      type: `${getEventType(this.event)}`,
      account: this.lookupAccountName(this.account),
    });
    message.addSection(this.event?.detail?.description);
    const target = 'https://eu-west-1.console.aws.amazon.com/securityhub/home?region=eu-west-1';
    message.addLink('Bekijk Inspector Finding in Security Hub', target);
    return message;
  }
}

export class DriftDetectionStatusFormatter extends MessageFormatter<any> {
  constructMessage(message: Message): Message {
    message.addHeader('❗️ Stack drift detection alert');
    message.addContext({
      type: `${getEventType(this.event)}`,
      account: this.lookupAccountName(this.account),
    });
    if (this.event?.detail) {
      message.addSection(this.event?.detail['stack-id']);
    }
    return message;
  }
}

export class SecurityHubFormatter extends MessageFormatter<any> {
  constructMessage(message: Message): Message {
    message.addHeader(`SecurityHub: ${this.event?.Title}`);
    message.addContext({
      type: 'securityhub',
      account: this.lookupAccountName(this.account),
      state: `${this.event?.WorkflowState}`,
    });
    if (this.event?.Description) {
      message.addSection(`${this.event?.Description}`);
    }

    let resourceString = '';
    for (const resource of this.event?.Resources) {
      resourceString = resourceString.concat(`- *${resource.Type}*: ${resource.Id}`);
    }
    if (resourceString != '') { message.addSection(resourceString); }

    return message;
  }
}

export class OrgTrailMessageFormatter extends MessageFormatter<any> {
  constructMessage(message: Message): Message {
    console.debug(this.event);
    message.addHeader(`${this.event?.eventName} event detected`);
    message.addContext({
      type: 'orgtrail',
      account: this.lookupAccountName(this.account),
      region: this.event?.awsRegion,
    });
    message.addSection(`${this?.event?.userIdentity?.principalId} triggered a ${this.event?.eventName} event. The event ID is *${this?.event?.eventID}*, of type ${this?.event?.eventType}.`);
    if (this?.event?.requestParameters && this?.event?.eventType == 'AwsApiCall') {
      message.addContext(this?.event?.requestParameters);
    }
    return message;
  }
}

export class UnhandledEventFormatter extends MessageFormatter<any> {
  constructMessage(message: Message): Message {
    message.addHeader('Unhandled event');
    message.addContext({
      type: 'unhandled event from SNS topic',
      account: this.lookupAccountName(this.account),
    });
    message.addSection(`Monitoring topic received an unhandled event. No message format available. Message: \n\`\`\`${JSON.stringify(this.event)}\`\`\` `);
    const target = 'https://eu-west-1.console.aws.amazon.com/cloudwatch/home?region=eu-west-1';
    message.addLink('Open CloudWatch', target);
    return message;
  }
}

export class LogsMessageFormatter extends MessageFormatter<CloudWatchLogsDecodedData> {
  constructMessage(message: Message): Message {
    const codeBlock = '```';
    message.addHeader('Log subscription');
    message.addContext({
      'account': this.lookupAccountName(this.account),
      'log group': this.event.logGroup,
    });
    this.event.logEvents.forEach(log => {
      const text = `${codeBlock}${log.message}${codeBlock}`;
      message.addSection(text);
    });
    return message;
  }
}


export class CloudTrailErrorLogsMessageFormatter extends MessageFormatter<CloudWatchLogsDecodedData> {
  constructMessage(message: Message): Message {
    let headerText: string | undefined = undefined;
    const sections: string[] = [];
    const codeBlock = '```';


    this.event.logEvents.forEach(log => {
      const messageJson = JSON.parse(log.message);
      if (headerText && headerText != messageJson.errorCode) {
        headerText = 'Error';
      } else {
        headerText = messageJson.errorCode;
      }
      const text = `\`${messageJson.errorCode}\` for event \`${messageJson.eventName}\` in service \`${messageJson.eventSource}\`, principal: \`${messageJson.userIdentity.principalId}\`. ${codeBlock}${messageJson.errorMessage}${codeBlock}`;
      sections.push(text);
    });
    headerText = (headerText == undefined) ? 'Error' : headerText;

    message.addHeader(headerText);
    message.addContext({
      'account': this.lookupAccountName(this.account),
      'log group': this.event.logGroup,
    });
    sections.forEach(section => message.addSection(section));
    return message;
  }
}


export class CustomSnsMessageFormatter extends MessageFormatter<any> {
  constructMessage(message: Message): Message {

    message.addHeader(this.event.title);
    message.addSection(this.event.message);
    message.addContext(this.event.context);

    return message;
  }
}
