import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { handler } from '..';
import { LogsEventHandler } from '../LogsEventHandler';
import { SnsEventHandler } from '../SnsEventHandler';
import { constructLogSubscriptionEvent, getEventFromFilePath } from './util';

let axiosMock: MockAdapter;

beforeAll(() => {
  process.env.ACCOUNT_NAME = 'testing';
  process.env.SLACK_WEBHOOK_URL = 'http://nothing.test';
});

beforeEach(() => {
  axiosMock = new MockAdapter(axios);
});

describe('handler', () => {

  test('SNS event', async () => {
    axiosMock.onPost().reply(200, {});
    const event = await getEventFromFilePath('samples/ecs-task-state-change.json');

    await handler(event);
    expect(axiosMock.history.post.length).toBe(1);
    const data = JSON.parse(axiosMock.history.post[0].data);
    expect(data.blocks[0].text.text).toContain('ECS Task not in desired state');

  });

  test('Log subscription event', async () => {
    axiosMock.onPost().reply(200, {});
    const event = await getEventFromFilePath('samples/log-subscription-event.json');

    await handler(event);
    expect(axiosMock.history.post.length).toBe(1);
    const data = JSON.parse(axiosMock.history.post[0].data);
    expect(data.blocks[3].text.text).toContain('```Log2```');

  });

});

describe('SNS events', () => {

  const snsHandler = new SnsEventHandler();
  const logsHandler = new LogsEventHandler();

  test('ecs task state change', async () => {
    const event = await getEventFromFilePath('samples/ecs-task-state-change.json');

    const handled = snsHandler.handle(event);
    expect(snsHandler.canHandle(event)).toBeTruthy();
    expect(logsHandler.canHandle(event)).toBeFalsy();
    expect(handled).not.toBeFalsy();
    if (handled == false) { return; }
    expect(handled.priority).toBe('high');

    const json = JSON.stringify(handled.message.getSlackMessage());
    expect(json).toContain('account: *testing*');
    expect(json).toContain('type: *ECS Task State Change, cluster joost-test*');
    expect(json).toContain('ECS Task not in desired state (state PENDING, desired RUNNING)');

  });

});


describe('Log subscription events', () => {

  const logsHandler = new LogsEventHandler();
  const snsHandler = new SnsEventHandler();

  const obj1 = { id: 'obj1', b: [1, 2, 3], c: { x: "'\"{}\n\t\f" } };
  const obj2 = { id: 'obj2', b: [1, 2, 3], c: { x: "'\"{}\n\t\f" } };
    

  test('Test log event basic', async () => {
    const event = await getEventFromFilePath('samples/log-subscription-event.json');

    const handled = logsHandler.handle(event);
    expect(logsHandler.canHandle(event)).toBeTruthy();
    expect(snsHandler.canHandle(event)).toBeFalsy();
    expect(handled).not.toBeFalsy();
    if (handled == false) { return; }
    expect(handled.priority).toBe('high');


    const json = JSON.stringify(handled.message.getSlackMessage(), null, 2);
    console.log(json);
    expect(json).toContain('account: *testing*');
    expect(json).toContain('log group: *test-group*');
    expect(json).toContain('```Log1```');
    expect(json).toContain('```Log2```');

  });

  test('Test log event with JSON', async () => {
    const event = await getEventFromFilePath('samples/log-subscription-event-json.json');

    const handled = logsHandler.handle(event);
    expect(logsHandler.canHandle(event)).toBeTruthy();
    expect(snsHandler.canHandle(event)).toBeFalsy();
    expect(handled).not.toBeFalsy();
    if (handled == false) { return; }
    expect(handled.priority).toBe('high');


    const json = JSON.stringify(handled.message.getSlackMessage(), null, 2);
    console.log(handled.message.getSlackMessage().blocks[3].text.text);
    expect(json).toContain('account: *testing*');
    expect(json).toContain('log group: *test-group*');
    expect(json).toContain(obj1);
    expect(json).toContain(obj2);

  });

  test('Construct log event', () => {
    constructLogSubscriptionEvent(obj1, obj2);
  });

});
