import fs from 'fs';
import path from 'path';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { getEventType, parseMessageFromEvent, messageShouldTriggerAlert, sendMessageToSlack, slackMessageFromSNSMessage } from '../index';

let axiosMock: MockAdapter;
beforeAll(() => {
  process.env.SLACK_WEBHOOK_URL = 'http://nothing.test';
  process.env.ACCOUNT_NAME = 'Test-account';
  axiosMock = new MockAdapter(axios);
});

beforeEach(() => {
  axiosMock.reset();
});

describe('Test message types', () => {
  test('ECS Task state change', async () => {
    const sampleEventJson = await getStringFromFilePath(path.join('samples', 'ecs-task-state-change.json'));
    const event = JSON.parse(sampleEventJson);
    const message = parseMessageFromEvent(event);
    const type = getEventType(message);
    expect(type).toBe('ECS Task State Change');
  });

  test('Unknown message', async () => {
    const sampleAlarmEventJson = await getStringFromFilePath(path.join('samples', 'unknown-event.json'));
    const event = JSON.parse(sampleAlarmEventJson);
    const message = parseMessageFromEvent(event);
    expect(() => slackMessageFromSNSMessage(message)).toThrow();
  });
});

describe('Alarms: Test only alerting on state change FROM or TO ALARM', () => {
  test('PreviousState ALARM should report', async () => {
    const sampleAlarmEventJson = await getStringFromFilePath(path.join('samples', 'from-alarm.json'));
    const event = JSON.parse(sampleAlarmEventJson);
    const message = parseMessageFromEvent(event);
    expect(messageShouldTriggerAlert(message)).toBe(true);
  });

  test('State ALARM should report', async () => {
    const sampleAlarmEventJson = await getStringFromFilePath(path.join('samples', 'alarm.json'));
    const event = JSON.parse(sampleAlarmEventJson);
    const message = parseMessageFromEvent(event);
    expect(messageShouldTriggerAlert(message)).toBe(true);
  });

  test('State OK should not report if previousstate is not ALARM', async () => {
    const sampleAlarmEventJson = await getStringFromFilePath(path.join('samples', 'alarm-from-ok-to-insufficient-data.json'));
    const event = JSON.parse(sampleAlarmEventJson);
    const message = parseMessageFromEvent(event);
    expect(messageShouldTriggerAlert(message)).toBe(false);
  });
});

describe('Test alarm state changes', () => {
  test('Parse event type', async () => {
    const sampleAlarmEventJson = await getStringFromFilePath(path.join('samples', 'alarm.json'));
    const event = JSON.parse(sampleAlarmEventJson);
    const message = parseMessageFromEvent(event);
    const type = getEventType(message);
    expect(type).toBe('CloudWatch Alarm State Change');
  });

  test('Get values for alarm type message', async () => {
    axiosMock.onPost().reply(200, {});
    const sampleAlarmEventJson = await getStringFromFilePath(path.join('samples', 'alarm.json'));
    const event = JSON.parse(sampleAlarmEventJson);
    const message = parseMessageFromEvent(event);
    await sendMessageToSlack(slackMessageFromSNSMessage(message));
    expect(axiosMock.history.post.length).toBe(1);
    const data = JSON.parse(axiosMock.history.post[0].data);
    expect(data?.blocks[0].text.text).toBe('❗️ Alarm: Certificate about to expire');
  });
});

describe('ECS State changes', () => {
  test('All changes should report', async () => {
    const sampleEventJson = await getStringFromFilePath(path.join('samples', 'ecs-task-state-change.json'));
    const event = JSON.parse(sampleEventJson);
    const message = parseMessageFromEvent(event);
    expect(messageShouldTriggerAlert(message)).toBe(true);
  });

  test('All changes should report', async () => {
    const sampleEventJson = await getStringFromFilePath(path.join('samples', 'ecs-task-state-change.json'));
    const event = JSON.parse(sampleEventJson);
    const message = parseMessageFromEvent(event);
    expect(messageShouldTriggerAlert(message)).toBe(true);
  });

  test('Get slack message object', async () => {
    axiosMock.onPost().reply(200, {});
    const sampleEventJson = await getStringFromFilePath(path.join('samples', 'ecs-task-state-change.json'));
    const event = JSON.parse(sampleEventJson);
    const message = parseMessageFromEvent(event);
    await sendMessageToSlack(slackMessageFromSNSMessage(message));
    const data = JSON.parse(axiosMock.history.post[0].data);
    expect(data?.blocks[2].text.text).toBe('Containers involved: \n - test-sleep (PENDING)');
  });

  test('Get slack message object', async () => {
    axiosMock.onPost().reply(200, {});
    const sampleEventJson = await getStringFromFilePath(path.join('samples', 'ecs-task-state-change.json'));
    const event = JSON.parse(sampleEventJson);
    const message = parseMessageFromEvent(event);
    await sendMessageToSlack(slackMessageFromSNSMessage(message));
    const data = JSON.parse(axiosMock.history.post[0].data);
    expect(data?.blocks).toHaveLength(4);
  });
});


describe('EC2 State changes', () => {
  test('Running', async () => {
    axiosMock.onPost().reply(200, {});
    const sampleEventJson = await getStringFromFilePath(path.join('samples', 'ec2-instance-state-change.json'));
    const event = JSON.parse(sampleEventJson);
    const message = parseMessageFromEvent(event);
    await sendMessageToSlack(slackMessageFromSNSMessage(message));
    const data = JSON.parse(axiosMock.history.post[0].data);
    expect(data?.blocks[2].text.text).toContain('i-0482279efaef0935a');
  });
});

async function getStringFromFilePath(filePath: string): Promise<string> {
  return new Promise((res, rej) => {
    fs.readFile(path.join(__dirname, filePath), (err, data) => {
      if (err) { return rej(err); }
      return res(data.toString());
    });
  });
}