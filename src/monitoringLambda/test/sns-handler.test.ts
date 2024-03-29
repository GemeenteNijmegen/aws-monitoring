import * as path from 'path';
import { getEventFromFilePath } from './util';
import { Configuration } from '../../DeploymentEnvironments';
import { LogsEventHandler } from '../LogsEventHandler';
import { getEventType, parseMessageFromEvent, SnsEventHandler } from '../SnsEventHandler';

beforeAll(() => {
  process.env.SLACK_WEBHOOK_URL = 'http://nothing.test';
  process.env.SLACK_WEBHOOK_URL_LOW_PRIO = 'http://nothing.test.low.prio';
});

const config: Configuration = {
  branchName: 'sandbox',
  environmentName: 'development',
  pipelineStackCdkName: 'aws-monitoring-sandbox',
  deployToEnvironments: [
    {
      accountName: 'workload-test',
      accountType: 'development',
      env: { account: '12345678', region: 'eu-central-1' },
    },
    {
      accountName: 'workload-prod',
      accountType: 'production',
      env: { account: '87654321', region: 'eu-central-1' },
    },
  ],
};

describe('SNS events', () => {

  const snsHandler = new SnsEventHandler(config);
  const logsHandler = new LogsEventHandler();

  test('ecs task state change', async () => {
    const event = await getEventFromFilePath('samples/ecs-task-state-change.json');

    const handled = snsHandler.handle(event);
    expect(snsHandler.canHandle(event)).toBeTruthy();
    expect(logsHandler.canHandle(event)).toBeFalsy();
    expect(handled).not.toBeFalsy();
    if (handled == false) { return; }
    expect(handled.priority).toBe('medium');

    const json = JSON.stringify(handled.message.getSlackMessage());
    expect(json).toContain('type: *ECS Task State Change, cluster joost-test*');
    expect(json).toContain('ECS Task not in desired state (state PENDING, desired RUNNING)');

  });

  test('ec2 instance state change', async () => {
    const event = await getEventFromFilePath('samples/ec2-instance-state-change.json');

    const handled = snsHandler.handle(event);
    expect(snsHandler.canHandle(event)).toBeTruthy();
    expect(logsHandler.canHandle(event)).toBeFalsy();
    expect(handled).not.toBeFalsy();
    if (handled == false) { return; }
    expect(handled.priority).toBe('high');

    const blocks = handled.message.getSlackMessage().blocks;
    expect(blocks[0].text.text).toBe('EC2 instance running');
    expect(blocks[1].elements[0].text).toBe('type: *EC2 Instance State-change Notification*');
    expect(blocks[2].text.text).toBe('Instance id: i-0482279efaef0935a');
    expect(blocks[3].text.text).toContain('Bekijk instance');
    expect(blocks[3].text.text).toContain('https://eu-west-1.console.aws.amazon.com/ec2/v2/home?region=eu-west-1#InstanceDetails:instanceId=i-0482279efaef0935a');

  });

  test('unknown event', async () => {
    const event = await getEventFromFilePath('samples/unknown-event.json');

    const handled = snsHandler.handle(event);
    expect(snsHandler.canHandle(event)).toBeTruthy();
    expect(logsHandler.canHandle(event)).toBeFalsy();
    expect(handled).toBeFalsy();

  });

});


describe('Alarms via SNS events', () => {

  const snsHandler = new SnsEventHandler(config);


  test('New LZ ALARM should report', async () => {
    const event = await getEventFromFilePath(path.join('samples', 'new-lz-in-alarm.json'));
    const handled = snsHandler.handle(event);
    if (handled == false) {
      expect(handled).not.toBeFalsy();
      return;
    }
    const json = JSON.stringify(handled.message.getSlackMessage());
    expect(json).toContain('account: *123456*');
    expect(handled).not.toBeFalsy();
  });

  test('PreviousState ALARM should report', async () => {
    const event = await getEventFromFilePath(path.join('samples', 'from-alarm.json'));
    const handled = snsHandler.handle(event);
    expect(handled).not.toBeFalsy();
  });

  test('State ALARM should report', async () => {
    const event = await getEventFromFilePath(path.join('samples', 'alarm.json'));
    const handled = snsHandler.handle(event);
    expect(handled).not.toBeFalsy();
  });

  test('State OK should not report if previousstate is not ALARM', async () => {
    const event = await getEventFromFilePath(path.join('samples', 'alarm-from-ok-to-insufficient-data.json'));
    const handled = snsHandler.handle(event);
    expect(handled).toBe(false);
  });

  test('Alarm from MPA forwared', async () => {
    const event = await getEventFromFilePath(path.join('samples', 'alarm-from-mpa.json'));
    const handled = snsHandler.handle(event);
    expect(handled).not.toBeFalsy();
  });

  test('Alarm event processed', async () => {
    const event = await getEventFromFilePath(path.join('samples', 'alarm.json'));

    const handled = snsHandler.handle(event);
    if (handled == false) {
      expect(handled).not.toBeFalsy();
      return;
    }

    const message = handled.message.getSlackMessage().blocks;
    expect(message[0].text.text).toBe('❗️ Alarm: Certificate about to expire');
  });

  test('Alarm is excluded', async () => {
    const event = await getEventFromFilePath(path.join('samples', 'alarm-excluded.json'));
    const handled = snsHandler.handle(event);
    expect(handled).toBe(false);
  });

  test('Alarm event from mpa processed', async () => {
    const event = await getEventFromFilePath(path.join('samples', 'alarm-rootuser-new-lz.json'));

    const handled = snsHandler.handle(event);
    if (handled == false) {
      expect(handled).not.toBeFalsy();
      return;
    }

    const message = handled.message.getSlackMessage().blocks;
    expect(message[0].text.text).toContain('❗️ Alarm: ');
  });
});

describe('Security hub event from Subject', () => {
  test('Security hub high notification triggers', async () => {
    const event = await getEventFromFilePath(path.join('samples', 'securityhub-new-lz.json'));
    const message = parseMessageFromEvent(event);
    const type = getEventType(message, event);
    expect(type).toBe('SecurityHub');
  });

  test('Security hub high message formatter works', async () => {
    const snsHandler = new SnsEventHandler(config);

    const event = await getEventFromFilePath(path.join('samples', 'securityhub-new-lz-2.json'));
    const handled = snsHandler.handle(event);
    if (handled == false) {
      expect(handled).not.toBeFalsy();
      return;
    }
    const json = JSON.stringify(handled.message.getSlackMessage());
    console.debug(json);
    expect(json).toContain('state: *NEW*');
    expect(handled).not.toBeFalsy();
  });
});

describe('Cloudtrail log events', () => {
  const snsHandler = new SnsEventHandler(config);
  test('Eventtype is detected', async () => {
    const event = await getEventFromFilePath(path.join('samples', 'orgtrail-notification-sample.json'));
    const message = parseMessageFromEvent(event);
    const type = getEventType(message, event);
    expect(type).toBe('OrgTrailFromMPA');
  });

  test('Message formatter works', async () => {

    const event = await getEventFromFilePath(path.join('samples', 'orgtrail-notification-sample.json'));
    const handled = snsHandler.handle(event);
    if (handled == false) {
      expect(handled).not.toBeFalsy();
      return;
    }
    const json = JSON.stringify(handled.message.getSlackMessage());
    expect(json).toContain('DeleteBucket event detected');
    expect(handled).not.toBeFalsy();
  });
});

describe('More message types from SNS events', () => {

  test('Devopsguru eventbridge event', async () => {
    const event = await getEventFromFilePath(path.join('samples', 'messages', 'event-devopsguru-insight.json'));
    const type = getEventType(event);
    expect(type).toBe('DevOps Guru New Insight Open');
  });

  test('ACM Certificate Approaching Expiration event', async () => {
    const event = await getEventFromFilePath(path.join('samples', 'messages', 'certificate-approaching-expiry.json'));
    const type = getEventType(event);
    expect(type).toBe('ACM Certificate Approaching Expiration');
  });

  test('not yet defined event is unhandledEvent', async () => {
    const event = await getEventFromFilePath(path.join('samples', 'messages', 'event-devopsguru-severity-upgraded.json'));
    const type = getEventType(event);
    expect(type).toBe('unhandledEvent');
  });

});
