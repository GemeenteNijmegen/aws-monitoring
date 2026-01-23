import { S3StorageService } from './S3StorageService';
import { SlackClient } from './SlackClient';
import { TrackedSlackMessage } from '../shared/models/TrackedSlackMessage';
import { TrackedSlackMessageRepository } from '../shared/TrackedSlackMessageRepository';

export class ArchiverService {
  private readonly messageRepository: TrackedSlackMessageRepository;
  private readonly slackClient: SlackClient;
  private readonly s3Storage: S3StorageService;

  constructor(
    messageTableName: string,
    slackBotToken: string,
    s3BucketName: string,
  ) {
    this.messageRepository = new TrackedSlackMessageRepository(messageTableName);
    this.slackClient = new SlackClient(slackBotToken);
    this.s3Storage = new S3StorageService(s3BucketName);
  }

  async processCommands(): Promise<void> {
    const messages = await this.getAllMessages();
    for (const message of messages) {
      try {
        const shouldProcess = this.shouldProcessMessage(message);
        if (shouldProcess) {
          await this.processMessage(message);
        }
      } catch (error) {
        console.error(`Error processing message ${message.messageId}:`, error);
        await this.sendErrorNotification(message, error);
      }
    }
  }

  private async getAllMessages(): Promise<TrackedSlackMessage[]> {
    return this.messageRepository.getAllCommands();
  }

  private shouldProcessMessage(message: TrackedSlackMessage): boolean {
    const now = new Date();
    const messageAge = now.getTime() - message.timestamp.getTime();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;

    // For messages newer than 1 day, process every invocation
    if (messageAge < oneDay) {
      return true;
    }

    // For older messages, process once a day
    const lastMidnight = new Date(now);
    lastMidnight.setHours(0, 0, 0, 0);

    return message.timestamp >= lastMidnight;
  }

  private async processMessage(message: TrackedSlackMessage): Promise<void> {
    console.log(`Processing message: ${message.messageId}`);

    const thread = await this.slackClient.getThread(message.channelId, message.threadId);

    // Skip if last message is already a backup confirmation
    if (thread.messages.length > 0) {
      const lastMessage = thread.messages[thread.messages.length - 1];
      if (lastMessage.text.includes('Thread archived successfully')) {
        console.log(`Skipping ${message.messageId}: already archived`);
        return;
      }
    }

    // Download and store images
    for (const msg of thread.messages) {
      if (msg.files) {
        for (const file of msg.files) {
          const fileData = await this.slackClient.downloadFile(file.url_private);
          const s3Key = await this.s3Storage.storeFile(
            message.messageId,
            thread.threadId,
            file.id,
            file.name,
            fileData,
            file.mimetype,
            message.timestamp,
          );
          file.s3Key = s3Key;
        }
      }
    }

    const s3Key = await this.s3Storage.storeThread(message.messageId, thread, message.timestamp);

    console.log(`Successfully archived thread for message ${message.messageId} to ${s3Key}`);
    await this.slackClient.postMessage(
      message.channelId,
      message.threadId,
      `✅ Thread archived successfully to S3: ${s3Key}`,
    );
  }

  private async sendErrorNotification(message: TrackedSlackMessage, error: unknown): Promise<void> {
    try {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.slackClient.postMessage(
        message.channelId,
        message.threadId,
        `❌ Failed to archive thread: ${errorMessage}`,
      );
    } catch (notificationError) {
      console.error('Failed to send error notification:', notificationError);
    }
  }
}