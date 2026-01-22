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
    slackClientSecret: string,
    slackClientId: string,
    s3BucketName: string,
  ) {
    this.messageRepository = new TrackedSlackMessageRepository(messageTableName);
    this.slackClient = new SlackClient(slackClientSecret, slackClientId);
    this.s3Storage = new S3StorageService(s3BucketName);
  }

  async processCommands(): Promise<void> {
    // Load all messages from message table
    const messages = await this.getAllMessages();
    for (const message of messages) {
      try {
        const shouldProcess = this.shouldProcessMessage(message);
        if (shouldProcess) {
          await this.processMessage(message);
        }
      } catch (error) {
        console.error(`Error processing message ${message.messageId}:`, error);
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

    const { channelId, threadTs } = SlackClient.extractChannelAndThread(message.threadId);
    const thread = await this.slackClient.getThread(channelId, threadTs);

    const s3Key = await this.s3Storage.storeThread(message.messageId, thread);
    console.log(`Successfully archived thread for message ${message.messageId} to ${s3Key}`);
  }
}