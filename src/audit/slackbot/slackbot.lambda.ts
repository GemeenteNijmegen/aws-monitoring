import { AWS } from '@gemeentenijmegen/utils';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { TrackedSlackMessage } from '../shared/models/TrackedSlackMessage';
import { SlackThreadResponse } from '../shared/SlackThreadResponse';
import { TrackedSlackMessageRepository } from '../shared/TrackedSlackMessageRepository';
import { slackAuthenticate } from './slack-authenticate';
import { TrackedSlackMessageParser } from './TrackedSlackMessageParser';
import { error } from 'console';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Received event:', JSON.stringify(event, null, 2));

  const slackThreadResponse = new SlackThreadResponse(await getSlackBotToken());
  const repository = new TrackedSlackMessageRepository(process.env.MESSAGE_TABLE_NAME!);


  let trackedSlackMessage: TrackedSlackMessage | undefined = undefined;
  try {
    const secret = await getSlackSecret();
    const authenticated = await slackAuthenticate(event, secret);
    if (!authenticated) {
      console.log('Unauthorized!');
      return response(403);
    }
    console.log('Authenticated!');

    trackedSlackMessage = TrackedSlackMessageParser.parse(event);

    await repository.save(trackedSlackMessage);
    console.log(`Successfully saved message (${trackedSlackMessage.messageId}) to DynamoDB for ${trackedSlackMessage.trackingGoal} registration purposes`);

    // Send response
    await slackThreadResponse.send(trackedSlackMessage.channelId, trackedSlackMessage.threadId, `✅ - DevOps bot is following this thread for ${trackedSlackMessage.trackingGoal} registration purposes`);

    return response();
  } catch (error) {
    console.error('Error processing message:', error);

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


function response(statusCode: number = 200) {
  return {
    statusCode: statusCode,
    body: '',
  };
}