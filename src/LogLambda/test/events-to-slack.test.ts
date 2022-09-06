import fs from 'fs';
import path from 'path';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { getEventType, sendMessageToSlack, slackMessageFromSNSMessage } from '../index';

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
  test('Devopsguru eventbridge event', async () => {
    const sampleEventJson = await getStringFromFilePath(path.join('samples', 'messages', 'event-devopsguru-insight.json'));
    const message = JSON.parse(sampleEventJson);
    const type = getEventType(message);
    expect(type).toBe('DevOps Guru New Insight Open');
  });

  test('Devopsguru eventbridge event send', async () => {
    axiosMock.onPost().reply(200, {});
    const sampleEventJson = await getStringFromFilePath(path.join('samples', 'messages', 'event-devopsguru-insight.json'));
    const message = JSON.parse(sampleEventJson);
    await sendMessageToSlack(slackMessageFromSNSMessage(message));
    expect(axiosMock.history.post.length).toBe(1);
    const data = JSON.parse(axiosMock.history.post[0].data);
    expect(data?.blocks[0].text.text).toBe('❗️ DevopsGuru Insight');
  });

  test('Certificate expiry event', async () => {
    axiosMock.onPost().reply(200, {});
    const sampleEventJson = await getStringFromFilePath(path.join('samples', 'messages', 'certificate-approaching-expiry.json'));
    const message = JSON.parse(sampleEventJson);
    await sendMessageToSlack(slackMessageFromSNSMessage(message));
    expect(axiosMock.history.post.length).toBe(1);
    const data = JSON.parse(axiosMock.history.post[0].data);
    expect(data?.blocks[0].text.text).toBe('Certificate nearing expiration');
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