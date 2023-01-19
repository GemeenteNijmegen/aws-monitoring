
import { LogsEventHandler } from '../LogsEventHandler';
import { SnsEventHandler } from '../SnsEventHandler';
import { constructLogSubscriptionEvent, getEventFromFilePath } from './util';

beforeAll(() => {
  process.env.ACCOUNT_NAME = 'testing';
  process.env.SLACK_WEBHOOK_URL = 'http://nothing.test';
  process.env.SLACK_WEBHOOK_URL_LOW_PRIO = 'http://nothing.test.low.prio';
});

describe('Log subscription events', () => {

  // Possible handlers (snsHandler should always return false for canHandle)
  const logsHandler = new LogsEventHandler();
  const snsHandler = new SnsEventHandler();

  // Test log lines (objects are stringified)
  const log1 = { id: 'log1', b: [1, 2, 3], c: { x: "'\"{}\n\t\f" } };
  const log2 = { id: 'log2', b: [1, 2, 3], x: { y: 'random string' } };
  const log3 = { id: 'log3', b: [1, 2, 3] };
  const log4 = { id: 'log3', c: { x: "'\"{}\n\t\f" } };
  const logStr1 = 'log-string-1';
  const logStr2 = 'log-string-2';

  test('Log event with strings creates message', async () => {
    const event = constructLogSubscriptionEvent({}, logStr1, logStr2);

    const handled = logsHandler.handle(event);
    expect(logsHandler.canHandle(event)).toBeTruthy();
    expect(snsHandler.canHandle(event)).toBeFalsy();
    expect(handled).not.toBeFalsy(); // Returns false if skipped
    if (handled == false) { throw Error('this should not be false'); }
    expect(handled.priority).toBe('high');

    const message = handled.message.getSlackMessage();
    expect(message.blocks[0].text.text).toBe('Log subscription');
    expect(message.blocks[1].elements[0].text).toBe('account: *testing*');
    expect(message.blocks[1].elements[1].text).toBe('log group: *test-log-group*');
    expect(message.blocks[2].text.text).toContain(logStr1);
    expect(message.blocks[3].text.text).toContain(logStr2);

  });

  test('Test log event with stringified objects creates messages', async () => {
    const event = constructLogSubscriptionEvent({}, log1, log2, log3, log4);

    const handled = logsHandler.handle(event);
    expect(logsHandler.canHandle(event)).toBeTruthy();
    expect(snsHandler.canHandle(event)).toBeFalsy();
    expect(handled).not.toBeFalsy();
    if (handled == false) { throw Error('this should not be false'); }
    expect(handled.priority).toBe('high');

    const message = handled.message.getSlackMessage();
    expect(message.blocks[0].text.text).toBe('Log subscription');
    expect(message.blocks[1].elements[0].text).toBe('account: *testing*');
    expect(message.blocks[1].elements[1].text).toBe('log group: *test-log-group*');
    expect(message.blocks[2].text.text).toContain(JSON.stringify(log1));
    expect(message.blocks[3].text.text).toContain(JSON.stringify(log2));
    expect(message.blocks[4].text.text).toContain(JSON.stringify(log3));
    expect(message.blocks[5].text.text).toContain(JSON.stringify(log4));
  });

  test('Log event with cloudtrail errors is formatted', async () => {
    const logMessage = await getEventFromFilePath('samples/log-event.json');
    const event = constructLogSubscriptionEvent({}, logMessage);
    const handled = logsHandler.handle(event);
    expect(handled).not.toBeFalsy();
    if (handled == false) { throw Error('should not be false'); }

    const message = handled.message.getSlackMessage();
    expect(message.blocks[0].text.text).toBe('AccessDenied');
  });

  test('Log event with cloudtrail and other errors is formatted', async () => {
    const logMessage = await getEventFromFilePath('samples/log-event.json');
    const event = constructLogSubscriptionEvent({}, logMessage, { errorCode: 'bla', errorMessage: 'something', userIdentity: { principalId: 'me' } });
    const handled = logsHandler.handle(event);
    expect(handled).not.toBeFalsy();
    if (handled == false) { throw Error('this should not be false'); }

    const message = handled.message.getSlackMessage();
    expect(message.blocks[0].text.text).toBe('Error');
  });

  test('Log event with excluded strings returns false', async () => {
    const event = constructLogSubscriptionEvent({}, 'User: arn:aws:sts::123456:assumed-role/config-drift-detection-role/configLambdaExecution is not authorized to perform: iam:GetRole on resource: role cdk-hnb659fds-lookup-role-123456-eu-west-1 because no identity-based policy allows the iam:GetRole action');
    const handled = logsHandler.handle(event);
    expect(handled).toBeFalsy();
  });

  test('Log event with excluded and not excluded strings filters excluded strings', async () => {
    const event = constructLogSubscriptionEvent({}, 'User: arn:aws:sts::123456:assumed-role/config-drift-detection-role/configLambdaExecution is not authorized to perform: iam:GetRole on resource: role cdk-hnb659fds-lookup-role-123456-eu-west-1 because no identity-based policy allows the iam:GetRole action', 'another log message');
    const handled = logsHandler.handle(event);
    if (handled == false) { throw Error('this should not be false'); }
    expect(handled).not.toBeFalsy();
    const message = handled.message.getSlackMessage();
    expect(message.blocks.filter((block: any) => block.type == 'section').length).toBe(1);
  });
});