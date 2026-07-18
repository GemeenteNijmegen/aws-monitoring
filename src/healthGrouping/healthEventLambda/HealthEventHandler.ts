import { Logger } from '@aws-lambda-powertools/logger';
import { SNSEvent, SNSEventRecord } from 'aws-lambda';
import { createHealthGroupIdentity, AwsHealthEvent } from '../support/HealthGroupKey';
import { FirstHealthMessageFormatter } from '../support/HealthMessageFormatter';
import { healthGroupingPriority } from '../support/HealthPriority';

export interface HealthEventRepository {
  groupExists(groupKey: string): Promise<boolean>;
  createGroup(identity: ReturnType<typeof createHealthGroupIdentity>, createdAt: string): Promise<void>;
  saveEvent(identity: ReturnType<typeof createHealthGroupIdentity>, event: ParsedHealthEvent): Promise<void>;
}

export interface HealthEventDependencies {
  repository: HealthEventRepository;
  scheduleTimer: (groupKey: string, scheduledAt: string) => Promise<void>;
  logger?: Logger;
}

interface ParsedHealthEvent extends AwsHealthEvent {
  readonly id: string;
  readonly time?: string;
  readonly account?: string;
  readonly detail?: {
    readonly eventArn?: string;
    readonly communicationId?: string;
    readonly page?: string;
    readonly totalPages?: string;
    readonly eventTypeCode?: string;
    readonly eventScopeCode?: string;
    readonly eventDescription?: Array<{ latestDescription?: string }>;
    readonly affectedAccount?: string;
  };
}

/**
 * Verwerkt AWS Health SNS-events voor de aparte grouping-flow.
 */
export class HealthEventHandler {
  private readonly logger: Logger;

  constructor(private readonly dependencies: HealthEventDependencies) {
    this.logger = dependencies.logger ?? new Logger({
      serviceName: 'aws-health-grouping',
    });
  }

  async handle(event: SNSEvent) {
    this.logger.info('Health flow: received SNS batch', {
      recordCount: event.Records.length,
    });

    for (const record of event.Records) {
      const healthEvent = this.parseHealthEvent(record);
      const identity = createHealthGroupIdentity(healthEvent);
      const timestamp = healthEvent.time ?? new Date().toISOString();
      this.logger.appendKeys({
        groupKey: identity.groupKey,
        eventArn: identity.eventArn,
        communicationId: identity.communicationId,
        eventId: healthEvent.id,
        account: healthEvent.account,
        eventTypeCode: healthEvent.detail?.eventTypeCode,
        eventScopeCode: healthEvent.detail?.eventScopeCode,
        page: healthEvent.detail?.page,
        totalPages: healthEvent.detail?.totalPages,
        snsMessageId: record.Sns.MessageId,
        scheduledAt: timestamp,
      });

      try {
        this.logger.info('Health flow: parsed SNS record');
        const isFirst = !(await this.dependencies.repository.groupExists(identity.groupKey));
        this.logger.info('Health flow: checked group existence', { isFirst });

        if (isFirst) {
          const priority = healthGroupingPriority([healthEvent.account]);
          const firstMessage = new FirstHealthMessageFormatter(healthEvent).format();
          await firstMessage.send(priority);
          this.logger.info('Health flow: sent first Slack message', {
            priority,
          });
          await this.dependencies.repository.createGroup(identity, timestamp);
          this.logger.info('Health flow: created group record');
          await this.dependencies.scheduleTimer(identity.groupKey, timestamp);
        }

        await this.dependencies.repository.saveEvent(identity, healthEvent);
        this.logger.info('Health flow: stored event record', { isFirst });
      } catch (error) {
        this.logger.error('Health flow: failed processing SNS record', error as Error);
        throw error;
      } finally {
        this.logger.resetKeys();
      }
    }
  }

  private parseHealthEvent(record: SNSEventRecord): ParsedHealthEvent {
    const message = JSON.parse(record.Sns.Message) as ParsedHealthEvent;

    if (!message.id) {
      throw new Error('AWS Health event missing required identifier: id');
    }

    return message;
  }
}

export type { ParsedHealthEvent };
