import { createHmac, timingSafeEqual } from 'crypto';
import { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Case-insensitive header lookup (API Gateway may deliver any casing)
 */
function getHeader(headers: APIGatewayProxyEvent['headers'] | null | undefined, name: string): string {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === wanted) {
      return value ?? '';
    }
  }
  return '';
}

/**
 * Authenticates the event
 * Extracts the headers and obtains the secret signing key and does
 * some hmac magic to authenticate the incomming event
 * Docs: https://api.slack.com/authentication/verifying-requests-from-slack#a_recipe_for_security
 * @param event
 * @returns
 */
export async function slackAuthenticate(event: APIGatewayProxyEvent, secret: string): Promise<boolean> {

  const body = event.body;
  const slackTimestamp = getHeader(event.headers, 'X-Slack-Request-Timestamp');
  const slackSignature = getHeader(event.headers, 'X-Slack-Signature');

  const timestamp = slackTimestamp.trim() === '' ? NaN : Number(slackTimestamp);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  // If the request is more than 1 minute away from now, ignore it (replay attack)
  if (Math.abs((Date.now() / 1000) - timestamp) > 60 * 1) {
    console.log('Replay attack');
    return false;
  }

  const request = `v0:${slackTimestamp}:${body}`;
  const signature = 'v0=' + createHmac('sha256', secret).update(request).digest('hex');

  const expected = Buffer.from(signature);
  const provided = Buffer.from(slackSignature);
  if (expected.length !== provided.length) {
    return false;
  }
  return timingSafeEqual(expected, provided);

}
