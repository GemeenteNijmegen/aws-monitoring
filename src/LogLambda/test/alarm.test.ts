import fs from 'fs';
import path from 'path';
import { getEventType, parseMessageFromEvent, slackParamsFromMessage, createMessage } from '../index';

describe('Test unknown message', () => {
  // This test doesn't run in CI by default, depends on unavailable secrets
  test('Parse event type', async () => {
    const sampleAlarmEventJson = await getStringFromFilePath(path.join('samples', 'unknown-event.json'));
    const event = JSON.parse(sampleAlarmEventJson);
    const message = parseMessageFromEvent(event);
    expect(() => slackParamsFromMessage(message)).toThrow();
  });
});


describe('Test alarm state changes', () => {
  // This test doesn't run in CI by default, depends on unavailable secrets
  test('Parse event type', async () => {
    const sampleAlarmEventJson = await getStringFromFilePath(path.join('samples', 'alarm.json'));
    const event = JSON.parse(sampleAlarmEventJson);
    const message = parseMessageFromEvent(event);
    const type = getEventType(message);
    expect(type).toBe('CloudWatch Alarm State Change');
  });

  test('Get values for alarm type message', async () => {
    const sampleAlarmEventJson = await getStringFromFilePath(path.join('samples', 'alarm.json'));
    const event = JSON.parse(sampleAlarmEventJson);
    const message = parseMessageFromEvent(event);
    const values = slackParamsFromMessage(message);
    expect(values.title).toBe('❗️ Alarm: Certificate about to expire');
  });

  test('Get slack message object', async () => {
    let messageObject = {
      title: '❗️ Alarm: Certificate about to expire',
      message: 'Threshold Crossed: 1 out of the last 1 datapoints [227.0 (08/08/22 12:32:00)] was less than or equal to the threshold (360.0) (minimum 1 datapoint for OK -> ALARM transition).',
      context: 'CloudWatch Alarm State Change',
      url: 'https://eu-west-1.console.aws.amazon.com/cloudwatch/home?region=eu-west-1#alarmsV2:alarm/CloudWatch%20Alarm%20State%20Change',
      url_text: 'Bekijk alarm',
    };
    const message = createMessage(messageObject);
    expect(message.blocks).toHaveLength(4);
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