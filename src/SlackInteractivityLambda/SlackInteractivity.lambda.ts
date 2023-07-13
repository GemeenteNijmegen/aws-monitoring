import * as crypto from 'crypto';
import { AWS } from '@gemeentenijmegen/utils';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { SlackMessage } from './SlackMessage';
import { TopDeskClient } from './TopDeskClient';

const topDeskClient = new TopDeskClient();

export async function handler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {

  console.info('Incomming event:', event, context);

  const authenticated = await authenticate(event);
  if (!authenticated) {
    console.log('Unauthorized!');
    return {
      body: JSON.stringify({'message': 'Unauthorized'}),
      statusCode: 401,
    };
  } else {
    console.log('Authenticated!');
  }

  try {
    return await handleSlackInteraction(event);
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({'message': 'Please check the logs for details'}),
    };
  }
}

async function handleSlackInteraction(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

  // Decode the message payload
  const payload = parsePayloadFromEvent(event);
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

/**
 * Decodes the slack interaction payload from the
 * @param event
 * @returns
 */
export function parsePayloadFromEvent(event: APIGatewayProxyEvent) {
  if (!event.body) {
    throw Error('No body found in event.');
  }
  const decoded = Buffer.from(event.body, 'base64').toString('utf-8');
  const params = new URLSearchParams(decoded);
  const body = params.get('payload');
  if (!body) {
    throw Error('Could not parse payload from body.');
  }
  const payload = decodeURIComponent(body);
  if (!payload) {
    throw Error('Could not parse payload from body.');
  }
  return JSON.parse(payload);
}


let slackSecret: string | undefined = undefined;

/**
 * Authenticates the event
 * Extracts the headers and obtains the secret signing key and does
 * some hmac magic to authenticate the incomming event
 * Docs: https://api.slack.com/authentication/verifying-requests-from-slack#a_recipe_for_security
 * @param event
 * @returns
 */
async function authenticate(event: APIGatewayProxyEvent) {

  // Get slack secret if still empty
  if (!slackSecret) {
    if (!process.env.SLACK_SECRET_ARN) {
      throw Error('No slack secret arn provied');
    }
    slackSecret = await AWS.getSecret(process.env.SLACK_SECRET_ARN);
  }

  const body = Buffer.from(event.body ?? '', 'base64').toString('utf-8');
  const slackTimestamp = event.headers['x-slack-request-timestamp'] ?? '0';
  const slackSignature = event.headers['x-slack-signature'];

  const request = `v0:${slackTimestamp}:${body}`;
  const signature = 'v0=' + crypto.createHmac('sha256', slackSecret).update(request).digest('hex');

  // If the request is > 1 minute old ignore it (replay attack)
  if ((Date.now()/1000) - parseInt(slackTimestamp) > 60 * 1) {
    console.log('Replay attack', slackTimestamp);
    return false;
  }

  return signature == slackSignature;

}


interface Action {
  id: string;
  value: any;
}

export function getActionFromPayload(payload: any) : Action {
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