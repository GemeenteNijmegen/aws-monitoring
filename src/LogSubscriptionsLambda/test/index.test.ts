import * as zlib from 'zlib';
import { CloudWatchLogsEvent } from 'aws-lambda';
import { handler } from '../index';
import { LogsMessageFormatter } from '../MessageFormatter';

describe('Log subscription lambda', () => {

  test('LogMessageFormatter', async () => {

    const message = {
      logGroup: 'test-group',
      logStream: '',
      messageType: '',
      owner: '',
      subscriptionFilters: [''],
      logEvents: [
        {
          message: 'Message',
          id: '1234',
          timestamp: new Date().getMilliseconds(),
        },
        {
          message: 'Message2',
          id: '1234',
          timestamp: new Date().getMilliseconds(),
        },
      ],
    };

    const formatter = new LogsMessageFormatter(message, '123456789012');
    const formatted = formatter.formattedMessage();

    expect(formatted.blocks[2].text.text).toContain('*Log group:* test-group');
    expect(formatted.blocks[2].text.text).toContain('Message');
    expect(formatted.blocks[2].text.text).toContain('Message2');

  });


  test('Handler', async () => {
    process.env.ACCOUNT_NAME = 'test';
    process.env.SLACK_WEBHOOK_URL = 'https://example.com';

    const message = {
      logGroup: 'test-group',
      logStream: '',
      messageType: '',
      owner: '',
      subscriptionFilters: [''],
      logEvents: [
        {
          message: 'Message',
          id: '1234',
          timestamp: new Date().getMilliseconds(),
        },
      ],
    };

    const json = JSON.stringify(message);
    const zip = zlib.gzipSync(json);
    const payload = zip.toString('base64');
    const event: CloudWatchLogsEvent = {
      awslogs: {
        data: payload,
      },
    };

    await handler(event, undefined);

  });
});