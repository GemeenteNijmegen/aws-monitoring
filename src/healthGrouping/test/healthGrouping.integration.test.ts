import * as path from 'path';
import { SQSEvent, SNSEvent } from 'aws-lambda';
import { SlackMessage } from '../../monitoringLambda/SlackMessage';
import { getEventFromFilePath } from '../../monitoringLambda/test/util';
import { HealthEventHandler } from '../healthEventLambda/HealthEventHandler';
import { HealthTimerHandler } from '../healthTimerLambda/HealthTimerHandler';
import { FakeHealthGroupingRepository } from '../repository/test/FakeHealthGroupingRepository';
import { HealthTimerMessage } from '../support/HealthGroupingTypes';
import { createHealthGroupIdentity } from '../support/HealthGroupKey';

function createTimerEvent(timerMessage: HealthTimerMessage): SQSEvent {
  return {
    Records: [
      {
        messageId: 'timer-message-1',
        receiptHandle: 'receipt-handle-1',
        body: JSON.stringify(timerMessage),
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: '0',
          SenderId: 'test',
          ApproximateFirstReceiveTimestamp: '0',
        },
        messageAttributes: {},
        md5OfBody: 'test',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:eu-central-1:123456789012:health-grouping-timer-queue',
        awsRegion: 'eu-central-1',
      },
    ],
  };
}

async function loadHealthEvent(sampleName: string): Promise<SNSEvent> {
  return getEventFromFilePath(
    path.join('..', '..', 'healthGrouping', 'samples', sampleName),
  ) as Promise<SNSEvent>;
}

function createTestContext() {
  const repository = new FakeHealthGroupingRepository();
  const scheduledTimerMessages: HealthTimerMessage[] = [];
  const sendSlackMessage = jest.spyOn(SlackMessage.prototype, 'send').mockResolvedValue(undefined);
  const healthEventHandler = new HealthEventHandler({
    repository,
    scheduleTimer: async (groupKey, scheduledAt) => {
      scheduledTimerMessages.push({ groupKey, scheduledAt });
    },
  });
  const healthTimerHandler = new HealthTimerHandler({
    repository,
  });

  return {
    repository,
    scheduledTimerMessages,
    sendSlackMessage,
    healthEventHandler,
    healthTimerHandler,
  };
}

function firstScheduledTimerMessage(scheduledTimerMessages: HealthTimerMessage[]): HealthTimerMessage {
  expect(scheduledTimerMessages).toHaveLength(1);
  return scheduledTimerMessages[0];
}

describe('Health grouping integration', () => {
  beforeEach(() => {
    process.env.BRANCH_NAME = 'sandbox';
  });

  test('single health event sends FIRST, schedules one timer message, and does not send GROUPED', async () => {
    const {
      repository,
      scheduledTimerMessages,
      sendSlackMessage,
      healthEventHandler,
      healthTimerHandler,
    } = createTestContext();
    const healthEvent = await loadHealthEvent('health-public-account-a.json');
    const expectedGroupKey = 'arn:aws:health:global::event/BILLING/AWS_BILLING_OPERATIONAL_ISSUE/AWS_BILLING_OPERATIONAL_ISSUE_EXAMPLE_PUBLIC#health-communication-public-1';

    await expect(healthEventHandler.handle(healthEvent)).resolves.toBeUndefined();

    expect(firstScheduledTimerMessage(scheduledTimerMessages)).toEqual({
      groupKey: expectedGroupKey,
      scheduledAt: '2026-07-17T19:56:44Z',
    });

    const openGroup = await repository.getGroup(expectedGroupKey);
    const storedEventsBeforeTimer = await repository.getGroupEvents(expectedGroupKey);
    expect(openGroup?.status).toBe('open');
    expect(storedEventsBeforeTimer).toHaveLength(1);
    expect(sendSlackMessage).toHaveBeenCalledTimes(1);

    await expect(healthTimerHandler.handle(createTimerEvent(firstScheduledTimerMessage(scheduledTimerMessages)))).resolves.toBeUndefined();

    const closedGroup = await repository.getGroup(expectedGroupKey);
    const storedEventsAfterTimer = await repository.getGroupEvents(expectedGroupKey);
    expect(closedGroup?.status).toBe('closed');
    expect(storedEventsAfterTimer).toHaveLength(1);
    expect(sendSlackMessage).toHaveBeenCalledTimes(1);

    sendSlackMessage.mockRestore();
  });

  test('two health events in the same group send FIRST and later one GROUPED message', async () => {
    const {
      repository,
      scheduledTimerMessages,
      sendSlackMessage,
      healthEventHandler,
      healthTimerHandler,
    } = createTestContext();
    const healthEventA = await loadHealthEvent('health-public-account-a.json');
    const healthEventB = await loadHealthEvent('health-public-account-b.json');
    const expectedGroupKey = 'arn:aws:health:global::event/BILLING/AWS_BILLING_OPERATIONAL_ISSUE/AWS_BILLING_OPERATIONAL_ISSUE_EXAMPLE_PUBLIC#health-communication-public-1';

    await expect(healthEventHandler.handle(healthEventA)).resolves.toBeUndefined();
    await expect(healthEventHandler.handle(healthEventB)).resolves.toBeUndefined();

    expect(scheduledTimerMessages).toHaveLength(1);
    expect(firstScheduledTimerMessage(scheduledTimerMessages)).toEqual({
      groupKey: expectedGroupKey,
      scheduledAt: '2026-07-17T19:56:44Z',
    });

    const openGroup = await repository.getGroup(expectedGroupKey);
    const storedEventsBeforeTimer = await repository.getGroupEvents(expectedGroupKey);
    expect(openGroup?.status).toBe('open');
    expect(storedEventsBeforeTimer).toHaveLength(2);
    expect(sendSlackMessage).toHaveBeenCalledTimes(1);

    await expect(healthTimerHandler.handle(createTimerEvent(firstScheduledTimerMessage(scheduledTimerMessages)))).resolves.toBeUndefined();

    const closedGroup = await repository.getGroup(expectedGroupKey);
    const storedEventsAfterTimer = await repository.getGroupEvents(expectedGroupKey);
    expect(closedGroup?.status).toBe('closed');
    expect(storedEventsAfterTimer).toHaveLength(2);
    expect(sendSlackMessage).toHaveBeenCalledTimes(2);

    sendSlackMessage.mockRestore();
  });

  test('six health events across three groups produce two GROUPED flows and one FIRST-only flow', async () => {
    const {
      repository,
      scheduledTimerMessages,
      sendSlackMessage,
      healthEventHandler,
      healthTimerHandler,
    } = createTestContext();
    const events = await Promise.all([
      loadHealthEvent('health-public-account-a.json'),
      loadHealthEvent('health-public-account-b.json'),
      loadHealthEvent('health-duplicate-account-a.json'),
      loadHealthEvent('health-account-specific-acm-renewal.json'),
      loadHealthEvent('health-account-specific-acm-renewal-duplicate.json'),
      loadHealthEvent('health-account-specific-acm-second-renewal.json'),
    ]);
    const billingGroupKey = createHealthGroupIdentity(JSON.parse(events[0].Records[0].Sns.Message)).groupKey;
    const acmGroupedGroupKey = createHealthGroupIdentity(JSON.parse(events[3].Records[0].Sns.Message)).groupKey;
    const acmFirstOnlyGroupKey = createHealthGroupIdentity(JSON.parse(events[5].Records[0].Sns.Message)).groupKey;

    for (const event of events) {
      await expect(healthEventHandler.handle(event)).resolves.toBeUndefined();
    }

    expect(scheduledTimerMessages).toHaveLength(3);
    expect(scheduledTimerMessages).toEqual([
      {
        groupKey: billingGroupKey,
        scheduledAt: '2026-07-17T19:56:44Z',
      },
      {
        groupKey: acmGroupedGroupKey,
        scheduledAt: '2026-07-18T04:08:40Z',
      },
      {
        groupKey: acmFirstOnlyGroupKey,
        scheduledAt: '2026-07-17T05:42:43Z',
      },
    ]);

    expect((await repository.getGroupEvents(billingGroupKey))).toHaveLength(3);
    expect((await repository.getGroupEvents(acmGroupedGroupKey))).toHaveLength(2);
    expect((await repository.getGroupEvents(acmFirstOnlyGroupKey))).toHaveLength(1);
    expect(sendSlackMessage).toHaveBeenCalledTimes(3);

    for (const timerMessage of scheduledTimerMessages) {
      await expect(healthTimerHandler.handle(createTimerEvent(timerMessage))).resolves.toBeUndefined();
    }

    expect((await repository.getGroup(billingGroupKey))?.status).toBe('closed');
    expect((await repository.getGroup(acmGroupedGroupKey))?.status).toBe('closed');
    expect((await repository.getGroup(acmFirstOnlyGroupKey))?.status).toBe('closed');
    expect(sendSlackMessage).toHaveBeenCalledTimes(5);

    sendSlackMessage.mockRestore();
  });
});
