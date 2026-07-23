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

  test('ecs task state change intermediate (one-off, PENDING) is suppressed', async () => {
    const event = await getEventFromFilePath('samples/ecs-task-state-change.json');
    expect(snsHandler.canHandle(event)).toBeTruthy();
    expect(logsHandler.canHandle(event)).toBeFalsy();
    // One-off task in a non-STOPPED intermediate state — no alert
    expect(snsHandler.handle(event)).toBe(false);
  });

  test('ecs scheduled task success is suppressed', async () => {
    const event = await getEventFromFilePath('samples/ecs-scheduled-success.json');
    expect(snsHandler.canHandle(event)).toBeTruthy();
    expect(snsHandler.handle(event)).toBe(false);
  });

  test('ecs scheduled task failure on non-production is downgraded to medium', async () => {
    const event = await getEventFromFilePath('samples/ecs-scheduled-failed.json');
    const handled = snsHandler.handle(event);
    expect(handled).not.toBeFalsy();
    if (handled == false) { return; }
    // Account 12345678 is development → high downgraded to medium
    expect(handled.priority).toBe('medium');
    const json = JSON.stringify(handled.message.getSlackMessage());
    expect(json).toContain('Scheduled task failed');
    expect(json).toContain('vac-container (exit 1)');
  });

  test('ecs scheduled task failure on production stays high', async () => {
    const event = await getEventFromFilePath('samples/ecs-scheduled-failed.json');
    // Patch the embedded message to use the production account
    const msg = JSON.parse(event.Records[0].Sns.Message);
    msg.account = '87654321';
    event.Records[0].Sns.Message = JSON.stringify(msg);

    const handled = snsHandler.handle(event);
    expect(handled).not.toBeFalsy();
    if (handled == false) { return; }
    // Account 87654321 is production → high stays high
    expect(handled.priority).toBe('high');
  });

  test('ecs scheduled task failed-to-start triggers high alert', async () => {
    const event = await getEventFromFilePath('samples/ecs-scheduled-failed-to-start.json');
    const handled = snsHandler.handle(event);
    expect(handled).not.toBeFalsy();
    if (handled == false) { return; }
    // Account 12345678 is development → high downgraded to medium
    expect(handled.priority).toBe('medium');
    const json = JSON.stringify(handled.message.getSlackMessage());
    expect(json).toContain('Scheduled task failed');
    expect(json).toContain('Task failed to start');
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


describe('ECS Service Task stops', () => {

  const snsHandler = new SnsEventHandler(config);

  test('crash stop (EssentialContainerExited) triggers medium alert', async () => {
    const event = await getEventFromFilePath('samples/ecs-service-crash-stop.json');
    const handled = snsHandler.handle(event);
    expect(handled).not.toBeFalsy();
    if (handled == false) { return; }
    expect(handled.priority).toBe('medium');
    const json = JSON.stringify(handled.message.getSlackMessage());
    expect(json).toContain('Service task stopped unexpectedly');
    expect(json).toContain('objecttypes-main-service');
  });

  test('crash stop on production account is medium (not high)', async () => {
    const event = await getEventFromFilePath('samples/ecs-service-crash-stop.json');
    // Patch to production account — service task stops are intentionally medium, not high
    const msg = JSON.parse(event.Records[0].Sns.Message);
    msg.account = '87654321';
    event.Records[0].Sns.Message = JSON.stringify(msg);

    const handled = snsHandler.handle(event);
    expect(handled).not.toBeFalsy();
    if (handled == false) { return; }
    expect(handled.priority).toBe('medium');
  });

  test('scheduler-initiated stop is suppressed', async () => {
    const event = await getEventFromFilePath('samples/ecs-service-scheduler-stop.json');
    expect(snsHandler.handle(event)).toBe(false);
  });

  test('user-initiated stop is suppressed', async () => {
    const event = await getEventFromFilePath('samples/ecs-service-user-stop.json');
    expect(snsHandler.handle(event)).toBe(false);
  });

  test('spot/TerminationNotice stop is suppressed', async () => {
    const event = await getEventFromFilePath('samples/ecs-service-spot-stop.json');
    expect(snsHandler.handle(event)).toBe(false);
  });

});

describe('ECS Deployment State Change', () => {

  const snsHandler = new SnsEventHandler(config);

  test('SERVICE_DEPLOYMENT_FAILED triggers high alert', async () => {
    const event = await getEventFromFilePath('samples/ecs-deployment-failed.json');
    const handled = snsHandler.handle(event);
    expect(handled).not.toBeFalsy();
    if (handled == false) { return; }
    expect(handled.priority).toBe('high');
    const json = JSON.stringify(handled.message.getSlackMessage());
    expect(json).toContain('Deployment failed');
    expect(json).toContain('servicetest');
    expect(json).toContain('circuit breaker');
  });

  test('SERVICE_DEPLOYMENT_COMPLETED is suppressed', async () => {
    const event = await getEventFromFilePath('samples/ecs-deployment-completed.json');
    expect(snsHandler.handle(event)).toBe(false);
  });

});

describe('ECS Service Action', () => {

  const snsHandler = new SnsEventHandler(config);

  test('SERVICE_TASK_START_IMPAIRED triggers high alert', async () => {
    const event = await getEventFromFilePath('samples/ecs-service-task-start-impaired.json');
    const handled = snsHandler.handle(event);
    expect(handled).not.toBeFalsy();
    if (handled == false) { return; }
    expect(handled.priority).toBe('high');
    const json = JSON.stringify(handled.message.getSlackMessage());
    expect(json).toContain('impaired');
    expect(json).toContain('servicetest');
  });

  test('SERVICE_TASK_PLACEMENT_FAILURE triggers high alert', async () => {
    const event = await getEventFromFilePath('samples/ecs-service-task-placement-failure.json');
    const handled = snsHandler.handle(event);
    expect(handled).not.toBeFalsy();
    if (handled == false) { return; }
    expect(handled.priority).toBe('high');
    const json = JSON.stringify(handled.message.getSlackMessage());
    expect(json).toContain('placement failed');
    expect(json).toContain('servicetest');
  });

  test('SERVICE_STEADY_STATE is suppressed', async () => {
    const event = await getEventFromFilePath('samples/ecs-service-steady-state.json');
    expect(snsHandler.handle(event)).toBe(false);
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
