import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { LogsEventHandler } from '../LogsEventHandler';
import { SnsEventHandler } from '../SnsEventHandler';
import { getEventFromFilePath } from './util';

let axiosMock: MockAdapter;

beforeAll(() => {
  process.env.ACCOUNT_NAME = 'testing';
  process.env.SLACK_WEBHOOK_URL = 'http://nothing.test';
});

beforeEach(() => {
  axiosMock = new MockAdapter(axios);
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
