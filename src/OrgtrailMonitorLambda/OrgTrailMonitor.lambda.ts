import * as zlib from 'zlib';
import { SNSClient } from '@aws-sdk/client-sns';
import { CloudWatchLogsDecodedData, CloudWatchLogsEvent } from 'aws-lambda';
import { OrgTrailMonitorHandler } from './OrgTrailMonitorHandler';
import { getConfiguration } from '../DeploymentEnvironments';

const client = new SNSClient({ region: process.env.AWS_REGION });
const deploymentEnvironments = getConfiguration(process.env.BRANCH_NAME!);

/**
 * This lambda will process logs that are aggregated in the organizations
 * cloud trail (or organisation trail). Based on configuration provided
 * in this repository we will monitor for a number of things:
 *  - KMS key usage for specific keys in specific accounts
 *  - Role assumption events
 * @param event
*/
export async function handler(event: CloudWatchLogsEvent) {
  const orgTrailHandler = new OrgTrailMonitorHandler(deploymentEnvironments, client);
  const parsed = parseMessageFromEvent(event);
  await orgTrailHandler.handleLogEvents(parsed);
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

