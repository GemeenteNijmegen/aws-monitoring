import { Logger } from '@aws-lambda-powertools/logger';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { environmentVariables } from '@gemeentenijmegen/utils';
import { SNSEvent } from 'aws-lambda';
import { HealthEventHandler } from './HealthEventHandler';
import { HealthGroupingRepository } from '../repository/HealthGroupingRepository';
import { HealthTimerMessage } from '../support/HealthGroupingTypes';

const logger = new Logger({
  serviceName: 'aws-health-grouping',
});
const sqsClient = new SQSClient({});

export async function handler(event: SNSEvent) {
  if (!isHealthGroupingEnabled()) {
    logger.warn('Health flow: disabled by feature flag');
    return;
  }

  const env = environmentVariables([
    'HEALTH_GROUPING_TABLE_NAME',
  ] as const);
  const eventHandler = new HealthEventHandler({
    repository: new HealthGroupingRepository(env.HEALTH_GROUPING_TABLE_NAME),
    scheduleTimer: defaultScheduleTimer,
    logger,
  });

  await eventHandler.handle(event);
}

async function defaultScheduleTimer(groupKey: string, scheduledAt: string): Promise<void> {
  const env = environmentVariables([
    'HEALTH_GROUPING_TIMER_QUEUE_URL',
  ] as const);
  const message: HealthTimerMessage = {
    groupKey,
    scheduledAt,
  };

  await sqsClient.send(new SendMessageCommand({
    QueueUrl: env.HEALTH_GROUPING_TIMER_QUEUE_URL,
    MessageBody: JSON.stringify(message),
  }));

  logger.info('Health flow: scheduled timer message', {
    queueUrl: env.HEALTH_GROUPING_TIMER_QUEUE_URL,
    scheduledAt,
  });
}

function isHealthGroupingEnabled(): boolean {
  const env = environmentVariables([
    'HEALTH_GROUPING_ENABLED',
  ] as const);
  return env.HEALTH_GROUPING_ENABLED.toLowerCase() === 'true';
}
