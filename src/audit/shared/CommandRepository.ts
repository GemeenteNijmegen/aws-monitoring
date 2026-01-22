import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SlackCommand, SlackCommandData } from './models/TrackedSlackMessage';

const DEFAULT_TTL = 5 * 7 * 24 * 3600; // 5 weeks in seconds

export class CommandRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(tableName: string) {
    if (!tableName) {
      throw new Error('No table name provided!');
    }
    const client = new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(client);
    this.tableName = tableName;
  }

  async save(command: SlackCommand, ttlSeconds: number = DEFAULT_TTL): Promise<void> {

    const expiresAt = (Date.now() / 1000) + ttlSeconds;

    const item: SlackCommandData = {
      messageId: command.messageId,
      timestamp: command.timestamp.toISOString(),
      commandType: command.commandType,
      threadId: command.threadId,
      expiresAt: expiresAt,
    };

    const putCommand = new PutCommand({
      TableName: this.tableName,
      Item: item,
    });

    await this.docClient.send(putCommand);
  }

  async getAllCommands(): Promise<SlackCommand[]> {
    const command = new ScanCommand({
      TableName: this.tableName,
    });

    const result = await this.docClient.send(command);
    return (result.Items || []).map(item => ({
      messageId: item.messageId,
      timestamp: new Date(item.timestamp),
      commandType: item.commandType as 'audit' | 'incident',
      threadId: item.threadId,
      expiresAt: item.expiresAt,
    }));
  }
}