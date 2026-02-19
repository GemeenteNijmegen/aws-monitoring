import { AWS } from '@gemeentenijmegen/utils';
import { ScheduledEvent } from 'aws-lambda';
import { ArchiverService } from './ArchiverService';

// Initialization
let archiverService: ArchiverService | undefined = undefined;
async function initialize() {
  const slackBotTokenArn = process.env.SLACK_BOT_TOKEN_ARN;
  const messageTableName = process.env.MESSAGE_TABLE_NAME;
  const s3BucketName = process.env.ARCHIVE_BUCKET_NAME;
  const slackBotToken = await AWS.getSecret(slackBotTokenArn!);
  if (!messageTableName || !s3BucketName || !slackBotTokenArn) {
    throw new Error('Missing required environment variables');
  }
  archiverService = new ArchiverService(
    messageTableName!,
    slackBotToken!,
    s3BucketName!,
  );
}

const init = initialize();

export async function handler(event: ScheduledEvent): Promise<void> {
  await init;
  console.log('Archiver lambda triggered:', JSON.stringify(event, null, 2));
  if (!archiverService) {
    throw new Error('Initialization failed');
  }
  try {
    await archiverService.processCommands();
    console.log('Archiver processing completed successfully');
  } catch (error) {
    console.error('Error in archiver lambda:', error);
    throw error;
  }
}