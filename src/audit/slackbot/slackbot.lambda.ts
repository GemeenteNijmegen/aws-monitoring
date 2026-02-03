import { AWS } from '@gemeentenijmegen/utils';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SlackClient } from '../archiver/SlackClient';
import { TrackedSlackMessageRepository } from '../shared/TrackedSlackMessageRepository';
import { SlackbotHandler } from './SlackbotHandler';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Received event:', JSON.stringify(event, null, 2));

  // Setup
  const secret = await getSlackSecret();
  const slackClient = new SlackClient(await getSlackBotToken());
  const repository = new TrackedSlackMessageRepository(process.env.MESSAGE_TABLE_NAME!);

  const handler = new SlackbotHandler({
    slackSecret: secret,
    slackClient: slackClient,
    trackedSlackMessagesRepository: repository
  });

  return await handler.handleRequest(event);

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


