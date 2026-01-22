import { AWS } from '@gemeentenijmegen/utils';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { TrackedSlackMessage } from '../shared/models/TrackedSlackMessage';
import { SlackThreadResponse } from '../shared/SlackThreadResponse';
import { TrackedSlackMessageRepository } from '../shared/TrackedSlackMessageRepository';
import { slackAuthenticate } from './slack-authenticate';
import { TrackedSlackMessageParser } from './TrackedSlackMessageParser';

const repository = new TrackedSlackMessageRepository(process.env.MESSAGE_TABLE_NAME!);

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Received event:', JSON.stringify(event, null, 2));


  let trackedSlackMessage: TrackedSlackMessage | undefined = undefined;

  try {

    // Do authentication
    const secret = await getSlackSecret();
    const authenticated = await slackAuthenticate(event, secret);
    if (!authenticated) {
      console.log('Unauthorized!');
      return response({ error: 'Unauthorized' }, 403);
    }
    console.log('Authenticated!');

    // Parse message
    trackedSlackMessage = TrackedSlackMessageParser.parse(event);

    // Save to dynamodb for tracking over time (handled by archiver)
    await repository.save(trackedSlackMessage);
    console.log(`Successfully saved message (${trackedSlackMessage.messageId}) to DynamoDB for ${trackedSlackMessage.trackingGoal} registration purposes`);

    // Reply in thread
    const messageResponse = new SlackThreadResponse(
      trackedSlackMessage.threadId,
      `✅ - DevOps bot is following this thread for ${trackedSlackMessage.trackingGoal} registration purposes`,
    );

    return response(messageResponse.getResponse());
  } catch (error) {
    console.error('Error processing message:', error);

    // See if we can make a nice response
    if (trackedSlackMessage?.threadId && error instanceof Error) {
      const messageResponse = new SlackThreadResponse(
        trackedSlackMessage.threadId,
        `❗️ - Failed to archive this thread! ${error.message}`,
      );
      return response(messageResponse.getResponse())
    }

    // Otherwise just return an internal server error
    return response({ error: 'Internal server error' }, 500);
  }
}


let slackSecret: string | undefined = undefined;
/**
 * Call secretsmanager to get the slack secret
 * @returns
 */
async function getSlackSecret() {
  // Get slack secret if still empty
  if (!slackSecret) {
    if (!process.env.SLACK_SECRET_ARN) {
      throw Error('No slack secret arn provied');
    }
    slackSecret = await AWS.getSecret(process.env.SLACK_SECRET_ARN);
  }
  return slackSecret;
}


function response(body: any, statusCode: number = 200) {
  let responseBody = undefined;
  if (typeof body == 'string' || body instanceof String) {
    responseBody = body;
  } else {
    responseBody = JSON.stringify(body);
  }
  return {
    statusCode: statusCode,
    body: body,
  };
}