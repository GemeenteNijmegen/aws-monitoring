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
    console.log('Processing log event', parsedLog);
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

    const accountConfiguration = monitoringConfiguration.find(conf => conf.accountId === accountId);
    if (!accountConfiguration) {
      return false;
    }

    const monitoredRoles = accountConfiguration.rolesToMonitor;
    const match = monitoredRoles?.find(role => role.endsWith(roleArn));

    if (match) {

      const accountName = accountConfiguration.accountName;
      const message = new MonitoringEvent();
      message.addTitle(`❗️ Role ${match} assumed in `);
      message.addMessage(`Role ${match} was assumed by ${event.userIdentity.principalId} in account ${accountName}`);
      await message.send(client);

      return true;
    }
  } catch (error) {
    console.error('Failed to check log for assed role', error);
    throw error;
  }
  return false;
}

/**
 * Check for KMS key usage.
 * @param logEvents
 */
async function checkForKmsKeyUsage(event: any) {
  if (event.eventSource != 'kms.amazonaws.com') {
    return false;
  }
  console.error('KMS KEY CHECK NOT IMPLEMENTED YET');
  console.log(event);
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


