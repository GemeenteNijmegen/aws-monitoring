import * as crypto from 'crypto';
import { AWS } from '@gemeentenijmegen/utils';
import { SQSEvent, SQSRecord } from 'aws-lambda';
import { SlackMessage } from './SlackMessage';
import { TopDeskClient } from './TopDeskClient';

/**
 * TopDesk client for creating tickets
 */
const topDeskClient = new TopDeskClient();

/**
 * Signing secrets (SHA265 hmac)
 */
let slackSecret: string | undefined = undefined;

/**
 * Interface to parse actions from the slack message
 * Different interactions have different actions
 */
interface Action {
  id: string;
  value: any;
}


export async function handler(event: SQSEvent) {

  console.info('Incomming event:', event);

  // Handle records
  for (let record of event.Records) {
    await handleInteraction(record);
  }

}

export async function handleInteraction(record: SQSRecord) {

  // Do authentication
  const authenticated = await authenticate(record);
  if (!authenticated) {
    console.log('Unauthorized!', record.messageId);
    return;
  }
  console.log('Authenticated!', record.messageId);

  try {
    const payload = getParsedPayload(record);
    return await handleSlackInteraction(payload);
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Please check the logs for details' }),
    };
  }
}

async function handleSlackInteraction(payload: any) {

  const message = SlackMessage.fromPayload(payload);

  // Parse the action details and crate a topdesk ticket
  const action = getActionFromPayload(payload);
  const ticketId = await topDeskClient.createNewTicket({
    title: action.value.title,
    htmlDescription: action.value.description,
    priority: action.value.priority,
  });
  console.debug('Ticket is created with ID:', ticketId);

  // Send back the response to slack
  message.removeAllInteractionBlocks();
  const link = `${process.env.TOPDESK_DEEP_LINK_URL}${ticketId}`;
  message.addLink('Go to TopDesk ticket', link);
  await message.send();

  return {
    statusCode: 200,
    body: JSON.stringify('ok'),
  };

};

function getParsedPayload(record: SQSRecord) {
  const params = new URLSearchParams(record.body);
  const payloadStr = params.get('payload');
  if (payloadStr) {
    return JSON.parse(payloadStr);
  }
  throw Error('No payload found in message');
}


/**
 * Authenticates the event
 * Extracts the headers and obtains the secret signing key and does
 * some hmac magic to authenticate the incomming event
 * Docs: https://api.slack.com/authentication/verifying-requests-from-slack#a_recipe_for_security
 * @param event
 * @returns
 */
async function authenticate(record: SQSRecord) {

  // Get slack secret if still empty
  if (!slackSecret) {
    if (!process.env.SLACK_SECRET_ARN) {
      throw Error('No slack secret arn provied');
    }
    slackSecret = await AWS.getSecret(process.env.SLACK_SECRET_ARN);
  }

  const payload = record.body.substring(8); // remove payload=
  const encodedPayload = encodeURIComponent(payload);
  const originalBody = Buffer.from(`payload=${encodedPayload}`).toString('base64');

  const slackTimestamp = record.messageAttributes.slackTimestamp.stringValue; // x-slack-request-timestamp header is mapped to message attribute
  const slackSignature = record.messageAttributes.slackSignature.stringValue; // x-slack-signature header is mapped to message attribute
  if (!slackTimestamp || !slackSignature || !originalBody) {
    return false;
  }

  const request = `v0:${slackTimestamp}:${originalBody}`;
  const signature = 'v0=' + crypto.createHmac('sha256', slackSecret).update(request).digest('hex');

  // If the request is > 1 minute old ignore it (replay attack)
  if ((Date.now()/1000) - parseInt(slackTimestamp) > 60 * 1) {
    console.log('Replay attack', slackTimestamp);
    return false;
  }

  return signature == slackSignature;

}


function getActionFromPayload(payload: any) : Action {
  if (!payload.actions || payload.actions.length != 1) {
    throw Error('Could not get action from payload');
  }
  const payloadAction = payload.actions[0];

  const base64ActionValue = payloadAction.value;
  const actionValue = Buffer.from(base64ActionValue, 'base64').toString('utf-8');
  const value = JSON.parse(actionValue);

  return {
    id: payloadAction.action_id,
    value: value,
  };
}