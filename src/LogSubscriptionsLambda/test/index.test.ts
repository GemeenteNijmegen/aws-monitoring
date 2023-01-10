import * as zlib from 'zlib';
import { CloudWatchLogsEvent } from 'aws-lambda';
import { handler } from '../index';
import { LogsMessageFormatter } from '../MessageFormatter';

describe('Log subscription lambda', () => {

  test('LogMessageFormatter', async () => {

    const event = {
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
          message: JSON.stringify({ a: 'Random string', b: [1, 2, 3], c: ' " \n { } ' }),
          id: '1234',
          timestamp: new Date().getMilliseconds(),
        },
      ],
    };

    const formatter = new LogsMessageFormatter(event, '123456789012');
    const formatted = formatter.formattedMessage();

    const message = JSON.stringify(formatted, null, 4);

    // Context
    expect(message).toContain('log group: *test-group*');
    expect(message).toContain('account: *123456789012*');

    // Messages
    expect(message).toContain('```Message```');
    expect(formatted.blocks[3].text.text).toBe('```{\"a\":\"Random string\",\"b\":[1,2,3],\"c\":\" \\\" \\n { } \"}```');

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