import { Logger } from '@aws-lambda-powertools/logger';
import { SecurityHubClient } from '@aws-sdk/client-securityhub';
import { AWS } from '@gemeentenijmegen/utils';
import { SQSEvent } from 'aws-lambda';
import { SuppressWorker } from './SuppressWorker';
import { getConfiguration } from '../../DeploymentEnvironments';
import { accountNameFor } from '../../monitoringLambda/SecurityHubMessage';
import { SuppressJob } from '../shared/ActionPayload';
import { SlackApi } from '../shared/SlackApi';

const logger = new Logger({ serviceName: 'security-hub-actions-worker' });
const securityHub = new SecurityHubClient({});

let botToken: string | undefined;

async function getBotToken(): Promise<string> {
  if (!botToken) {
    const arn = process.env.SLACK_BOT_TOKEN_ARN;
    if (!arn) {
      throw Error('SLACK_BOT_TOKEN_ARN must be set');
    }
    botToken = await AWS.getSecret(arn);
  }
  return botToken;
}

export async function handler(event: SQSEvent): Promise<void> {
  const userGroupId = process.env.USER_GROUP_ID;
  if (!userGroupId) {
    throw Error('USER_GROUP_ID must be set');
  }
  const configuration = getConfiguration(process.env.BRANCH_NAME ?? 'main');
  const worker = new SuppressWorker({
    slack: new SlackApi(await getBotToken()),
    securityHub,
    respond: SlackApi.respond,
    userGroupId,
    accountNameFor: (accountId: string) => accountNameFor(configuration, accountId),
    logger,
  });

  for (const record of event.Records) {
    const job = JSON.parse(record.body) as SuppressJob;
    await worker.handle(job);
  }
}
