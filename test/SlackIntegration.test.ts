import * as SlackInteraction from './slackInteraction.json';
import { parsePayloadFromEvent } from '../src/SlackInteractivityLambda/SlackInteractivity.lambda';

function buildBase64Payload() {
  const a = JSON.stringify(SlackInteraction);
  const b = encodeURIComponent(a);
  const c = `payload=${b}`;
  const d = Buffer.from(c).toString('base64');
  return d;
}

test('decode payload', () => {

  // Well... event is a large object, circumventing the typechecker 😬
  const event: any = {
    body: buildBase64Payload(),
  };

  const payload = parsePayloadFromEvent(event);

  console.log(payload);


});