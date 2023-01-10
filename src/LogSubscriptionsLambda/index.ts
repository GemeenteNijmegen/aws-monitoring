import * as zlib from 'zlib';
import { CloudWatchLogsDecodedData, CloudWatchLogsEvent } from 'aws-lambda';
import axios from 'axios';
import { LogsMessageFormatter } from './MessageFormatter';

export async function handler(event: CloudWatchLogsEvent, _context: any) {
  try {
    const message = parseMessageFromEvent(event);
    console.info('Log subscription event', JSON.stringify(message));
    const params = constrcutSlackMessage(message);
    await sendMessageToSlack(params, false); // Always high priority?
  } catch (error) {
    console.error(error);
  }
};

export function parseMessageFromEvent(event: CloudWatchLogsEvent): CloudWatchLogsDecodedData {
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
 * Get params for the slack message
 *
 * @param message CloudWatchLogsDecodedData message
 * @returns {object} a message object
 */
export function constrcutSlackMessage(message: CloudWatchLogsDecodedData): any {
  const account = process.env.ACCOUNT_NAME;
  if (!account) {
    throw Error('No account name defined in environment');
  }
  const formatter = new LogsMessageFormatter(message, account);
  return formatter.formattedMessage();
}

/**
 * Use axios to send a message to Slack
 *
 * @param message the message
 * @returns axios response
 */
export async function sendMessageToSlack(message: any, low_priority?: boolean) {
  const url = low_priority ? process.env?.SLACK_WEBHOOK_URL_LOW_PRIO : process.env?.SLACK_WEBHOOK_URL;
  if (!url) {
    throw Error('No slack webhook url defined');
  }
  return axios.post(url, message);
}