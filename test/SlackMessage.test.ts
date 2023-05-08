import * as SlackInteractionMessage from './slackInteraction.json';
import { SlackMessage as MonitoringSlackMessage } from '../src/monitoringLambda/SlackMessage';
import { getActionFromPayload } from '../src/SlackInteractivityLambda/SlackInteractivity.lambda';
import { SlackMessage as InteractionSlackMessage } from '../src/SlackInteractivityLambda/SlackMessage';

const obj = {
  title: 'random',
  description: 'bla bla',
  prority: 'low',
};
const base64obj = Buffer.from(JSON.stringify(obj)).toString('base64');

test('Action encdoing', () => {
  const m = new MonitoringSlackMessage();
  m.addButton('text', 'send', obj);
  const message = m.getSlackMessage();
  expect(message.blocks[0].elements[0].value).toBe(base64obj);
});

test('SlackMessage from payload', () => {
  InteractionSlackMessage.fromPayload(SlackInteractionMessage);
});

test('Action from payload', () => {
  const action = getActionFromPayload(SlackInteractionMessage);
  console.log(action);
  expect(action.value).toStrictEqual(obj);
});