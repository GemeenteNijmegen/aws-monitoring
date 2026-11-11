import { GetFindingsCommand, SecurityHubClient } from '@aws-sdk/client-securityhub';
import { mockClient } from 'aws-sdk-client-mock';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { constructLogSubscriptionEvent, getEventFromFilePath } from './util';
import { handler } from '../monitoring.lambda';

let axiosMock: MockAdapter;
const securityHubMock = mockClient(SecurityHubClient);

beforeAll(() => {
  process.env.ACCOUNT_NAME = 'testing';
  process.env.SLACK_WEBHOOK_URL = 'http://local.test';
  process.env.SLACK_WEBHOOK_URL_LOW = 'http://low.prio.local.test';
  process.env.SLACK_WEBHOOK_URL_MEDIUM = 'http://MEDIUM.prio.local.test';
  process.env.SLACK_WEBHOOK_URL_HIGH = 'http://HIGH.prio.local.test';
  process.env.SLACK_WEBHOOK_URL_CRITIICAL = 'http://CRITIICAL.prio.local.test';
});

beforeEach(() => {
  axiosMock = new MockAdapter(axios);
  securityHubMock.reset();
});

describe('handler', () => {

  test('Can handle SNS event', async () => {
    axiosMock.onPost().reply(200, {});
    const event = await getEventFromFilePath('samples/ecs-scheduled-failed.json');

    await handler(event);
    expect(axiosMock.history.post.length).toBe(1);
    const data = JSON.parse(axiosMock.history.post[0].data);
    expect(data.blocks[0].text.text).toContain('Scheduled task failed');

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

  describe('security hub enrichment', () => {
    const critical = { Id: 'f1', ProductArn: 'p', Title: 'T', Severity: { Label: 'CRITICAL' }, Workflow: { Status: 'NEW' }, Vulnerabilities: [{ FixAvailable: 'YES' }] };

    test('CRITICAL finding is posted with the vulnerability line', async () => {
      axiosMock.onPost().reply(200, {});
      securityHubMock.on(GetFindingsCommand).resolves({ Findings: [critical as any] });
      await handler(await getEventFromFilePath('samples/securityhub-critical.json'));
      expect(axiosMock.history.post.length).toBe(1);
      expect(axiosMock.history.post[0].data).toContain('Fix available');
    });

    test('lookup failure still posts the plain alert', async () => {
      axiosMock.onPost().reply(200, {});
      securityHubMock.on(GetFindingsCommand).rejects(new Error('boom'));
      await handler(await getEventFromFilePath('samples/securityhub-critical.json'));
      expect(axiosMock.history.post.length).toBe(1);
      expect(axiosMock.history.post[0].data).not.toContain('Fix available');
    });

    test('HIGH finding never calls GetFindings', async () => {
      axiosMock.onPost().reply(200, {});
      await handler(await getEventFromFilePath('samples/securityhub-new-lz.json'));
      expect(axiosMock.history.post.length).toBe(1);
      expect(securityHubMock.commandCalls(GetFindingsCommand)).toHaveLength(0);
    });
  });

});
