import { Logger } from '@aws-lambda-powertools/logger';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { AWS } from '@gemeentenijmegen/utils';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { handleSlackInteraction } from './SlackInteractionHandler';
import { SuppressJob } from '../shared/ActionPayload';
import { SlackApi } from '../shared/SlackApi';

const logger = new Logger({ serviceName: 'security-hub-actions-receiver' });
const sqsClient = new SQSClient({});

interface Secrets {
  signingSecret: string;
  botToken: string;
}
let secrets: Secrets | undefined;

async function getSecrets(): Promise<Secrets> {
  if (!secrets) {
    const signingArn = process.env.SLACK_SECRET_ARN;
    const botTokenArn = process.env.SLACK_BOT_TOKEN_ARN;
    if (!signingArn || !botTokenArn) {
      throw Error('SLACK_SECRET_ARN and SLACK_BOT_TOKEN_ARN must be set');
    }
    const [signingSecret, botToken] = await Promise.all([
      AWS.getSecret(signingArn),
      AWS.getSecret(botTokenArn),
    ]);
    secrets = { signingSecret, botToken };
  }
  return secrets;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const queueUrl = process.env.QUEUE_URL;
  if (!queueUrl) {
    throw Error('QUEUE_URL must be set');
  }
  const { signingSecret, botToken } = await getSecrets();

  return handleSlackInteraction(event, {
    signingSecret,
    slack: new SlackApi(botToken),
    enqueue: async (job: SuppressJob) => {
      await sqsClient.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(job) }));
    },
    logger,
  });
}
