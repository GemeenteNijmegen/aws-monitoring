import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ArchivedThread } from './models/ArchivedThread';

const DEFAULT_TTL = 5 * 7 * 24 * 3600; // 5 weeks in seconds

export class ArchiveRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(tableName: string) {
    const client = new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(client);
    this.tableName = tableName;
  }

  async getArchivedThread(commandId: string): Promise<ArchivedThread | null> {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: { commandId },
    });

    const result = await this.docClient.send(command);
    if (!result.Item) {
      return null;
    }

    return {
      commandId: result.Item.commandId,
      threadId: result.Item.threadId,
      messageHashes: result.Item.messageHashes || [],
      lastArchived: new Date(result.Item.lastArchived),
      s3Key: result.Item.s3Key,
      expiresAt: result.Item.expiresAt,
    };
  }

  async saveArchivedThread(archivedThread: ArchivedThread): Promise<void> {
    const command = new PutCommand({
      TableName: this.tableName,
      Item: {
        commandId: archivedThread.commandId,
        threadId: archivedThread.threadId,
        messageHashes: archivedThread.messageHashes,
        lastArchived: archivedThread.lastArchived.toISOString(),
        s3Key: archivedThread.s3Key,
        expiresAt: archivedThread.expiresAt,
      },
    });

    await this.docClient.send(command);
  }

  async getAllArchivedThreads(): Promise<ArchivedThread[]> {
    const command = new ScanCommand({
      TableName: this.tableName,
    });

    const result = await this.docClient.send(command);
    return (result.Items || []).map(item => ({
      commandId: item.commandId,
      threadId: item.threadId,
      messageHashes: item.messageHashes || [],
      lastArchived: new Date(item.lastArchived),
      s3Key: item.s3Key,
      expiresAt: item.expiresAt,
    }));
  }
}