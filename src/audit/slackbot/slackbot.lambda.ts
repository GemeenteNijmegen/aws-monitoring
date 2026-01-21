import { AWS } from '@gemeentenijmegen/utils';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { slackAuthenticate } from './slack-authenticate';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Received event:', JSON.stringify(event, null, 2));

  // Do authentication
  const secret = await getSlackSecret();
  const authenticated = await slackAuthenticate(event, secret);
  if (!authenticated) {
    console.log('Unauthorized!');
    return {
      body: JSON.stringify({ message: 'Unauthorized' }),
      statusCode: 403,
    };
  }
  console.log('Authenticated!');

  const parameters = new URLSearchParams(event.body ?? '');
  const command = parameters.get('command');

  console.log(`Processing command: ${command}`);

  if (command === '/audit') {
    console.log('Audit command triggered');
    return {
      statusCode: 200,
      body: JSON.stringify({ text: 'Audit command received' }),
    };
  }

  if (command === '/incident') {
    console.log('Incident command triggered');
    return {
      statusCode: 200,
      body: JSON.stringify({ text: 'Incident command received' }),
    };
  }

  console.log('Unknown command received');
  return {
    statusCode: 400,
    body: JSON.stringify({ text: 'Unknown command' }),
  };
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