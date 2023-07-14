import * as crypto from 'crypto';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { AWS } from '@gemeentenijmegen/utils';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const sqsClient = new SQSClient({ region: process.env.AWS_REGION });

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

  console.info('Incomming event:', event);

  // Do authentication
  const secret = await getSlackSecret();
  const authenticated = await authenticate(event, secret);
  if (!authenticated) {
    console.log('Unauthorized!');
    return {
      body: JSON.stringify({ message: 'Unauthorized' }),
      statusCode: 403,
    };
  }
  console.log('Authenticated!');

  // Do place message on queue
  try {
    const payload = getParsedPayload(event);
    console.log('Sending Message to queue...');
    await sqsClient.send(new SendMessageCommand({
      MessageBody: payload,
      QueueUrl: process.env.QUEUE_URL,
    }));
  } catch (error) {
    console.error(error);
    throw Error(`Could not send message to queue: ${error}`);
  }

  return {
    body: JSON.stringify({ message: 'Ok' }),
    statusCode: 200,
  };

}


/**
 * Signing secrets (SHA265 hmac)
 */
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

/**
 * Authenticates the event
 * Extracts the headers and obtains the secret signing key and does
 * some hmac magic to authenticate the incomming event
 * Docs: https://api.slack.com/authentication/verifying-requests-from-slack#a_recipe_for_security
 * @param event
 * @returns
 */
export async function authenticate(event: APIGatewayProxyEvent, secret: string) {

  let body = event.body;
  const slackTimestamp = event.headers['x-slack-request-timestamp'] ?? '';
  const slackSignature = event.headers['x-slack-signature'] ?? '';

  const request = `v0:${slackTimestamp}:${body}`;
  const signature = 'v0=' + crypto.createHmac('sha256', secret).update(request).digest('hex');
  console.log(`Generated signature (to match): ${signature} (${slackSignature})`);


  // If the request is > 1 minute old ignore it (replay attack)
  if ((Date.now()/1000) - parseInt(slackTimestamp) > 60 * 1) {
    console.log('Replay attack', slackTimestamp);
    return false;
  }

  console.debug('Calculated signature:', signature);
  console.debug('Provided signature:', slackSignature);

  return signature == slackSignature;

}

function getParsedPayload(event: APIGatewayProxyEvent) {
  const params = new URLSearchParams(event.body ?? '');
  const payloadStr = params.get('payload');
  if (payloadStr) {
    return JSON.parse(payloadStr);
  }
  throw Error('No payload found in message');
}