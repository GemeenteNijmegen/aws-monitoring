import { createHash } from 'crypto';
import { CommandRepository } from '../shared/CommandRepository';
import { SlackCommand } from '../shared/models/TrackedSlackMessage';
import { ArchiveRepository } from './ArchiveRepository';
import { ArchivedThread, SlackThread } from './models/ArchivedThread';
import { S3StorageService } from './S3StorageService';
import { SlackClient } from './SlackClient';

export class ArchiverService {
  private readonly commandRepository: CommandRepository;
  private readonly archiveRepository: ArchiveRepository;
  private readonly slackClient: SlackClient;
  private readonly s3Storage: S3StorageService;

  constructor(
    commandsTableName: string,
    archiveTableName: string,
    slackToken: string,
    s3BucketName: string,
  ) {
    this.commandRepository = new CommandRepository(commandsTableName);
    this.archiveRepository = new ArchiveRepository(archiveTableName);
    this.slackClient = new SlackClient(slackToken);
    this.s3Storage = new S3StorageService(s3BucketName);
  }

  async processCommands(): Promise<void> {
    const commands = await this.getAllCommands();

    for (const command of commands) {
      try {
        const shouldProcess = this.shouldProcessCommand(command);
        if (shouldProcess) {
          await this.processCommand(command);
        }
      } catch (error) {
        console.error(`Error processing command ${command.messageId}:`, error);
      }
    }
  }

  private async getAllCommands(): Promise<SlackCommand[]> {
    return this.commandRepository.getAllCommands();
  }

  private shouldProcessCommand(command: SlackCommand): boolean {
    const now = new Date();
    const commandAge = now.getTime() - command.timestamp.getTime();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;

    // For commands newer than 1 day, process every invocation
    if (commandAge < oneDay) {
      return true;
    }

    // For older commands, process once a day
    const lastMidnight = new Date(now);
    lastMidnight.setHours(0, 0, 0, 0);

    return command.timestamp >= lastMidnight;
  }

  private async processCommand(command: SlackCommand): Promise<void> {
    console.log(`Processing command: ${command.messageId}`);

    const { channelId, threadTs } = SlackClient.extractChannelAndThread(command.threadId);
    const thread = await this.slackClient.getThread(channelId, threadTs);

    const existingArchive = await this.archiveRepository.getArchivedThread(command.messageId);
    const currentHashes = this.generateMessageHashes(thread);

    if (this.hasThreadChanged(existingArchive, currentHashes)) {
      console.log(`Thread changed for command ${command.messageId}, archiving...`);

      const s3Key = await this.s3Storage.storeThread(command.messageId, thread);

      const archivedThread: ArchivedThread = {
        commandId: command.messageId,
        threadId: command.threadId,
        messageHashes: currentHashes,
        lastArchived: new Date(),
        s3Key,
      };

      await this.archiveRepository.saveArchivedThread(archivedThread);
      console.log(`Successfully archived thread for command ${command.messageId}`);
    } else {
      console.log(`No changes detected for command ${command.messageId}`);
    }
  }

  private generateMessageHashes(thread: SlackThread): string[] {
    return thread.messages.map(message => {
      const content = `${message.ts}:${message.user}:${message.text}`;
      return createHash('sha256').update(content).digest('hex');
    });
  }

  private hasThreadChanged(existingArchive: ArchivedThread | null, currentHashes: string[]): boolean {
    if (!existingArchive) {
      return true; // First time archiving
    }

    if (existingArchive.messageHashes.length !== currentHashes.length) {
      return true; // Different number of messages
    }

    return !existingArchive.messageHashes.every((hash, index) => hash === currentHashes[index]);
  }
}