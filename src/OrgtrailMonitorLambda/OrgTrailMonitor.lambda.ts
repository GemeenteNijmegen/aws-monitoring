import * as zlib from 'zlib';
import { SNSClient } from '@aws-sdk/client-sns';
import { CloudWatchLogsDecodedData, CloudWatchLogsEvent } from 'aws-lambda';
import { monitoringConfiguration } from './Configuration';
import { MonitoringEvent } from './MonitoringEvent';

const client = new SNSClient({ region: process.env.AWS_REGION });

/**
 * This lambda will process logs that are aggregated in the organizations
 * cloud trail (or organisation trail). Based on configuration provided
 * in this repository we will monitor for a number of things:
 *  - KMS key usage for specific keys in specific accounts
 *  - Role assumption events
 * @param event
 */
export async function handler(event: CloudWatchLogsEvent) {
  const parsed = parseMessageFromEvent(event);
  await processLogEvents(parsed);
}

/**
 * Loop trough multiple log events and process accordingly.
 * @param parsed
 */
async function processLogEvents(parsed: CloudWatchLogsDecodedData) {
  parsed.logEvents.forEach(async logEvent => {
    const parsedLog = JSON.parse(logEvent.message);
    //console.log('Processing log event', parsedLog);
    await checkForAssumedRole(parsedLog);
    await checkForKmsKeyUsage(parsedLog);
  });
}

/**
 * Check for role assumption events.
 * @param the log event
 * @returns false if no assume rol event
 */
async function checkForAssumedRole(event: any) {
  if (event.eventName != 'AssumeRole') {
    return false;
  }

  try {
    const accountId = event.resources.accountId;
    const roleArn = event.resources.ARN;
    const principal = getUserIdentity(event.userIdentity);

    const applicableConfigurations = getApplicableAccountConfigurations(accountId);
    applicableConfigurations.forEach(async (configuration) => {

      const accountName = configuration.accountName;
      const matchedRoles = configuration.rolesToMonitor?.filter(roleConfiguration => roleArn.endsWith(roleConfiguration.roleName));
      if (!matchedRoles) {
        return false;
      }

      console.log('Processing', event);

      matchedRoles.forEach(async (matchedRole) => {
        const message = new MonitoringEvent();
        message.addTitle(`❗️ Role ${matchedRole.roleName} assumed in ${accountName}`);
        message.addMessage(matchedRole.description);
        message.addContext('Account', accountName);
        message.addContext('Principal', principal);
        await message.send(client);
      });

      return true;
    });

  } catch (error) {
    //console.error('Failed to check log for assed role', error);
    throw error;
  }
  return false;
}

function getUserIdentity(userIdentity: any) {
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
  return 'unknown';
}


/**
 * Check for KMS key usage.
 * @param logEvents
 */
async function checkForKmsKeyUsage(event: any) {
  if (event.eventSource != 'kms.amazonaws.com') {
    return false;
  }
  //console.error('KMS KEY CHECK NOT IMPLEMENTED YET');
  //console.log(event);
  return false;
}

/**
 * Decode event from CloudWatch log subscription
 * @param event
 * @returns
 */
function parseMessageFromEvent(event: CloudWatchLogsEvent): CloudWatchLogsDecodedData {
  try {
    const payload = Buffer.from(event.awslogs.data, 'base64');
    const json = zlib.gunzipSync(payload);
    return JSON.parse(json.toString());
  } catch (error) {
    console.error('Failed parsing message');
    throw error;
  }
}

/**
 * Check the configuration for applicable account configurations
 * @param account
 * @returns
 */
function getApplicableAccountConfigurations(account: string) {
  const applicableConfigurations = monitoringConfiguration.filter(conf => conf.accountId === account || conf.accountId === '*');
  return applicableConfigurations ?? [];
}