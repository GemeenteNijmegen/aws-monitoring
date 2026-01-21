import { AWS } from '@gemeentenijmegen/utils';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CommandParser } from './CommandParser';
import { slackAuthenticate } from './slack-authenticate';
import { CommandRepository } from '../shared/CommandRepository';
import { SlackThreadResponse } from '../shared/SlackThreadResponse';

const repository = new CommandRepository(process.env.COMMANDS_TABLE_NAME!);

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Received event:', JSON.stringify(event, null, 2));

  try {

    // Do authentication
    const secret = await getSlackSecret();
    const authenticated = await slackAuthenticate(event, secret);
    if (!authenticated) {
      console.log('Unauthorized!');
      return response({ error: 'Unauthorized' }, 403);
    }
    console.log('Authenticated!');

    // Handle command
    const slackCommand = CommandParser.parse(event);
    if (!slackCommand) {
      console.log('Unable to parse command or unknown command type');
      return response({ error: 'Unknown or invalid command' }, 400);
    }

    // Do something usefull with the command we've received
    await repository.save(slackCommand);

    console.log(`Successfully saved ${slackCommand.commandType} command to DynamoDB`);

    const commandResponse = new SlackThreadResponse(
      slackCommand.threadId,
      `✅ - DevOps bot is following this thread and storing it as a: ${slackCommand.commandType}`,
    );

    return response(commandResponse.getResponse());
  } catch (error) {

    console.error('Error processing command:', error);
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