import { createHmac } from 'crypto';
import { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Authenticates the event
 * Extracts the headers and obtains the secret signing key and does
 * some hmac magic to authenticate the incomming event
 * Docs: https://api.slack.com/authentication/verifying-requests-from-slack#a_recipe_for_security
 * @param event
 * @returns
 */
export async function slackAuthenticate(event: APIGatewayProxyEvent, secret: string) {

  let body = event.body;
  const slackTimestamp = event.headers['X-Slack-Request-Timestamp'] ?? '';
  const slackSignature = event.headers['X-Slack-Signature'] ?? '';

  const request = `v0:${slackTimestamp}:${body}`;
  const signature = 'v0=' + createHmac('sha256', secret).update(request).digest('hex');
  console.log(`Generated signature (to match): ${signature} (${slackSignature})`);


  // If the request is > 1 minute old ignore it (replay attack)
  if ((Date.now() / 1000) - parseInt(slackTimestamp) > 60 * 1) {
    console.log('Replay attack', slackTimestamp);
    return false;
  }

  console.debug('Calculated signature:', signature);
  console.debug('Provided signature:', slackSignature);

  return signature == slackSignature;

}