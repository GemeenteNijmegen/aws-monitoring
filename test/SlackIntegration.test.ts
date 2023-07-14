import * as crypto from 'crypto';
import { authenticate } from '../src/SlackInteractivityLambda/SlackInteractivity.lambda';

process.env.SLACK_SECRET_ARN = 'arn:blabla';
process.env.AWS_REGION = 'eu-central-1';

test('No tests yet', () => {

  const timestamp = Math.floor(Date.now() / 1000);
  console.log(timestamp);
  const body = 'payload=%7Btest%7D';
  const slackSecret = 'OAEIJegjwogj0239230598weogijf';

  const request = `v0:${timestamp}:${body}`;
  const signature = 'v0=' + crypto.createHmac('sha256', slackSecret).update(request).digest('hex');

  // Circument the typechecker
  const event: any = {
    body,
    headers: {
      'x-slack-request-timestamp': `${timestamp}`,
      'x-slack-signature': signature,
    },
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/slack',
  };

  const authenticated = authenticate(event, slackSecret);

  expect(authenticated).toBeTruthy();

});