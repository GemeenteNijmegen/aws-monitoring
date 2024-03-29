import * as SlackInteractionMessage from './slackInteraction.json';
import { SlackMessage as MonitoringSlackMessage } from '../src/monitoringLambda/SlackMessage';
import { SlackMessage as InteractionSlackMessage } from '../src/TopdeskIntegrationLambda/SlackMessage';

const obj = {
  title: 'random',
  description: 'bla bla',
  prority: 'low',
};
const base64obj = Buffer.from(JSON.stringify(obj)).toString('base64');

test('Action encoding', () => {
  const m = new MonitoringSlackMessage();
  m.addButton('text', 'send', obj);
  const message = m.getSlackMessage();
  expect(message.blocks[0].elements[0].value).toBe(base64obj);
});

test('SlackMessage from payload', () => {
  const m = InteractionSlackMessage.fromPayload(SlackInteractionMessage);
  const message = m.getSlackMessage();
  expect(message.blocks.filter((block) => block.type == 'actions'))
    .toHaveLength(1);
});
