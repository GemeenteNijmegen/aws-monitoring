import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { HealthGroupEventRecord, HealthGroupRecord, HealthGroupStatus } from '../support/HealthGroupingTypes';
import { HealthGroupIdentity } from '../support/HealthGroupKey';

const DEFAULT_GROUP_TTL_SECONDS = 24 * 3600;

export interface HealthGroupingRepositoryEvent {
  readonly id: string;
  readonly account?: string;
  readonly time?: string;
  readonly detail?: {
    readonly affectedAccount?: string;
  };
}

/**
 * Levert de minimale opslagacties voor Health-grouping:
 * groep aanmaken, events opslaan en controleren of een groep al bestaat.
 */
export class HealthGroupingRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(tableName: string) {
    if (!tableName) {
      throw new Error('No table name provided!');
    }

    this.docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
    this.tableName = tableName;
  }

  async createGroup(
    identity: HealthGroupIdentity,
    createdAt: string,
    now: Date = new Date(),
    ttlSeconds: number = DEFAULT_GROUP_TTL_SECONDS,
  ): Promise<void> {
    const ttl = Math.floor(now.getTime() / 1000) + ttlSeconds;
    const groupRecord = createGroupRecord(identity, createdAt, ttl);

    await this.docClient.send(new PutCommand({
      TableName: this.tableName,
      Item: groupItem(groupRecord),
      ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
    }));
  }

  async saveEvent(
    identity: HealthGroupIdentity,
    event: HealthGroupingRepositoryEvent,
    now: Date = new Date(),
  ): Promise<void> {
    const timestamp = eventTimestamp(event, now);
    const eventRecord = createEventRecord(identity.groupKey, event, timestamp);

    // Losse events worden opgeslagen; timerverwerking bepaalt later aantallen en samenvatting.
    await this.docClient.send(new PutCommand({
      TableName: this.tableName,
      Item: eventItem(eventRecord),
      ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
    }));
  }

  async getGroup(groupKey: string): Promise<HealthGroupRecord | undefined> {
    const result = await this.docClient.send(new GetCommand({
      TableName: this.tableName,
      Key: groupItemKey(groupKey),
    }));

    return result.Item as HealthGroupRecord | undefined;
  }

  async getGroupEvents(groupKey: string): Promise<HealthGroupEventRecord[]> {
    const result = await this.docClient.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :eventPrefix)',
      ExpressionAttributeValues: {
        ':pk': groupPartitionKey(groupKey),
        ':eventPrefix': 'EVENT#',
      },
    }));

    return (result.Items ?? []) as HealthGroupEventRecord[];
  }

  async groupExists(groupKey: string): Promise<boolean> {
    return !!(await this.getGroup(groupKey));
  }

  async claimGroup(groupKey: string): Promise<boolean> {
    try {
      await this.updateGroupStatus(groupKey, 'open', 'claimed');
      return true;
    } catch (error) {
      if (isConditionalUpdateFailure(error)) {
        return false;
      }
      throw error;
    }
  }

  async closeGroup(groupKey: string): Promise<void> {
    await this.updateGroupStatus(groupKey, 'claimed', 'closed');
  }

  async reopenGroup(groupKey: string): Promise<void> {
    await this.updateGroupStatus(groupKey, 'claimed', 'open');
  }

  private async updateGroupStatus(
    groupKey: string,
    expectedStatus: HealthGroupStatus,
    nextStatus: HealthGroupStatus,
  ): Promise<void> {
    await this.docClient.send(new UpdateCommand({
      TableName: this.tableName,
      Key: groupItemKey(groupKey),
      UpdateExpression: 'SET #status = :nextStatus',
      ConditionExpression: '#status = :expectedStatus',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':expectedStatus': expectedStatus,
        ':nextStatus': nextStatus,
      },
    }));
  }
}

function groupPartitionKey(groupKey: string): string {
  return `GROUP#${groupKey}`;
}

function groupItemKey(groupKey: string): { PK: string; SK: 'GROUP' } {
  return {
    PK: groupPartitionKey(groupKey),
    SK: 'GROUP',
  };
}

function eventSortKey(eventId: string): string {
  return `EVENT#${eventId}`;
}

function createGroupRecord(
  identity: HealthGroupIdentity,
  createdAt: string,
  ttl: number,
): HealthGroupRecord {
  return {
    groupKey: identity.groupKey,
    eventArn: identity.eventArn,
    communicationId: identity.communicationId,
    status: 'open',
    firstSeenAt: createdAt,
    lastSeenAt: createdAt,
    ttl,
  };
}

function createEventRecord(
  groupKey: string,
  event: HealthGroupingRepositoryEvent,
  timestamp: string,
): HealthGroupEventRecord {
  return {
    groupKey,
    eventId: event.id,
    account: eventAccount(event),
    affectedAccount: event.detail?.affectedAccount,
    receivedAt: timestamp,
    event,
  };
}

function eventTimestamp(event: HealthGroupingRepositoryEvent, now: Date): string {
  return event.time ?? now.toISOString();
}

function eventAccount(event: HealthGroupingRepositoryEvent): string {
  return event.account ?? 'unknown';
}

function groupItem(groupRecord: HealthGroupRecord): HealthGroupRecord & { PK: string; SK: 'GROUP' } {
  return {
    ...groupItemKey(groupRecord.groupKey),
    ...groupRecord,
  };
}

function eventItem(eventRecord: HealthGroupEventRecord): HealthGroupEventRecord & { PK: string; SK: string } {
  return {
    PK: groupPartitionKey(eventRecord.groupKey),
    SK: eventSortKey(eventRecord.eventId),
    ...eventRecord,
  };
}

function isConditionalUpdateFailure(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException';
}
