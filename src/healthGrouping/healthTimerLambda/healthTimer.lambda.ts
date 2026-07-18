import { Logger } from '@aws-lambda-powertools/logger';
import { environmentVariables } from '@gemeentenijmegen/utils';
import { SQSEvent, SQSBatchResponse } from 'aws-lambda';
import { HealthTimerHandler } from './HealthTimerHandler';
import { HealthGroupingRepository } from '../repository/HealthGroupingRepository';

const logger = new Logger({
  serviceName: 'aws-health-grouping-timer',
});

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  if (!isHealthGroupingEnabled()) {
    logger.warn('Health timer flow: disabled by feature flag');
    return { batchItemFailures: [] };
  }

  const env = environmentVariables([
    'HEALTH_GROUPING_TABLE_NAME',
  ] as const);
  const timerHandler = new HealthTimerHandler({
    repository: new HealthGroupingRepository(env.HEALTH_GROUPING_TABLE_NAME),
    logger,
  });

  return timerHandler.handle(event);
}

function isHealthGroupingEnabled(): boolean {
  const env = environmentVariables([
    'HEALTH_GROUPING_ENABLED',
  ] as const);
  return env.HEALTH_GROUPING_ENABLED.toLowerCase() === 'true';
}
