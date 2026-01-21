import { AWS } from '@gemeentenijmegen/utils';
import { ScheduledEvent } from 'aws-lambda';
import { ArchiverService } from './ArchiverService';

export async function handler(event: ScheduledEvent): Promise<void> {
  console.log('Archiver lambda triggered:', JSON.stringify(event, null, 2));

  try {
    const commandsTableName = process.env.COMMANDS_TABLE_NAME;
    const archiveTableName = process.env.ARCHIVE_TABLE_NAME;
    const s3BucketName = process.env.ARCHIVE_BUCKET_NAME;
    const slackTokenArn = process.env.SLACK_TOKEN_ARN;

    if (!commandsTableName || !archiveTableName || !s3BucketName || !slackTokenArn) {
      throw new Error('Missing required environment variables');
    }

    const slackToken = await AWS.getSecret(slackTokenArn);

    const archiverService = new ArchiverService(
      commandsTableName,
      archiveTableName,
      slackToken,
      s3BucketName,
    );

    await archiverService.processCommands();
    console.log('Archiver processing completed successfully');
  } catch (error) {
    console.error('Error in archiver lambda:', error);
    throw error;
  }
}