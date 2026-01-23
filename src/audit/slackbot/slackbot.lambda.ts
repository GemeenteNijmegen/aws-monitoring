import { AWS } from '@gemeentenijmegen/utils';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { slackAuthenticate } from './slack-authenticate';
import { TrackedSlackMessageParser } from './TrackedSlackMessageParser';
import { TrackedSlackMessage } from '../shared/models/TrackedSlackMessage';
import { SlackThreadResponse } from '../shared/SlackThreadResponse';
import { TrackedSlackMessageRepository } from '../shared/TrackedSlackMessageRepository';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Received event:', JSON.stringify(event, null, 2));

  // Setup
  const secret = await getSlackSecret();
  const slackThreadResponse = new SlackThreadResponse(await getSlackBotToken());
  const repository = new TrackedSlackMessageRepository(process.env.MESSAGE_TABLE_NAME!);

  let trackedSlackMessage: TrackedSlackMessage | undefined = undefined;
  try {

    // Parse body
    const body = JSON.parse(event.body ?? '{}');

    // Authenticate
    const authenticated = await slackAuthenticate(event, secret);
    if (!authenticated) {
      console.log('Unauthorized!');
      return response(body, 403);
    }
    console.log('Authenticated!');

    if (event.headers['X-Slack-Retry-Num']) {
      console.log('Retry message from Slack, skipping...');
      return response(body);
    }

    // Parse message
    trackedSlackMessage = TrackedSlackMessageParser.parse(event);

    // Store message in message table
    await repository.save(trackedSlackMessage);
    console.log(`Successfully saved message (${trackedSlackMessage.messageId}) to DynamoDB for ${trackedSlackMessage.trackingGoal} registration purposes`);

    // Send response
    await slackThreadResponse.send(trackedSlackMessage.channelId, trackedSlackMessage.threadId, `✅ - DevOps bot is following this thread for ${trackedSlackMessage.trackingGoal} registration purposes`);
    return response(body);

  } catch (error) {
    console.error('Error processing message:', error);

    // send a nice error if possible
    if (trackedSlackMessage?.threadId && error instanceof Error) {
      await slackThreadResponse.send(trackedSlackMessage.channelId, trackedSlackMessage.threadId, `❗️ - Failed to archive this thread. ${error.message} `);
    }

    return response(500);
  }
}


let slackSecret: string | undefined = undefined;
let slackBotToken: string | undefined = undefined;

async function getSlackSecret() {
  if (!slackSecret) {
    if (!process.env.SLACK_SECRET_ARN) {
      throw Error('No slack secret arn provided');
    }
    slackSecret = await AWS.getSecret(process.env.SLACK_SECRET_ARN);
  }
  return slackSecret;
}

async function getSlackBotToken() {
  if (!slackBotToken) {
    if (!process.env.SLACK_BOT_TOKEN_ARN) {
      throw Error('No slack bot token arn provided');
    }
    slackBotToken = await AWS.getSecret(process.env.SLACK_BOT_TOKEN_ARN);
  }
  return slackBotToken;
}


function response(body: any, statusCode: number = 200) {
  // Handle Slack URL verification challenge
  if (body.type === 'url_verification') {
    return {
      statusCode: statusCode,
      body: JSON.stringify({ challenge: body.challenge }),
    };
  }
  return {
    statusCode: statusCode,
    body: '',
  };
}