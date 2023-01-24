import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { constructLogSubscriptionEvent, getEventFromFilePath } from './util';
import { handler } from '..';

let axiosMock: MockAdapter;

beforeAll(() => {
  process.env.ACCOUNT_NAME = 'testing';
  process.env.SLACK_WEBHOOK_URL = 'http://nothing.test';
  process.env.SLACK_WEBHOOK_URL_LOW_PRIO = 'http://nothing.test.low.prio';
});

beforeEach(() => {
  axiosMock = new MockAdapter(axios);
});

describe('handler', () => {

  test('Can handle SNS event', async () => {
    axiosMock.onPost().reply(200, {});
    const event = await getEventFromFilePath('samples/ecs-task-state-change.json');

    await handler(event);
    expect(axiosMock.history.post.length).toBe(1);
    const data = JSON.parse(axiosMock.history.post[0].data);
    expect(data.blocks[0].text.text).toContain('ECS Task not in desired state');

  });

  test('Can handle log subscription event', async () => {
    axiosMock.onPost().reply(200, {});

    const logStr1 = 'log-string-1';
    const logStr2 = 'log-string-2';
    const event = constructLogSubscriptionEvent({}, logStr1, logStr2);

    await handler(event);
    expect(axiosMock.history.post.length).toBe(1);
    const data = JSON.parse(axiosMock.history.post[0].data);
    expect(data.blocks[2].text.text).toContain(logStr1);
    expect(data.blocks[3].text.text).toContain(logStr2);

  });

});
