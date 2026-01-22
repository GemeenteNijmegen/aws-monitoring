import { AWS } from '@gemeentenijmegen/utils';
import { ScheduledEvent } from 'aws-lambda';
import { ArchiverService } from './ArchiverService';

// Initialization
let archiverService: ArchiverService | undefined = undefined;
async function initialize() {
  const slackClientSecretArn = process.env.SLACK_CLIENT_SECRET_ARN;
  const slackClientIdArn = process.env.SLACK_CLIENT_ID_ARN;
  const messageTableName = process.env.MESSAGE_TABLE_NAME;
  const s3BucketName = process.env.ARCHIVE_BUCKET_NAME;
  const slackClientSecret = await AWS.getSecret(slackClientSecretArn!);
  const slackClientId = await AWS.getParameter(slackClientIdArn!);
  if (!messageTableName || !s3BucketName || !slackClientSecretArn || !slackClientIdArn) {
    throw new Error('Missing required environment variables');
  }
  archiverService = new ArchiverService(
    messageTableName!,
    slackClientSecret!,
    slackClientId!,
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