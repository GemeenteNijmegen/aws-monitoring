import { Logger } from '@aws-lambda-powertools/logger';
import { SQSEvent, SQSRecord } from 'aws-lambda';
import { HealthGroupEventRecord, HealthGroupRecord, HealthTimerMessage } from '../support/HealthGroupingTypes';
import { GroupedHealthMessageFormatter } from '../support/HealthMessageFormatter';

const groupedHealthPriority = 'high';

export interface HealthTimerRepository {
  getGroup(groupKey: string): Promise<HealthGroupRecord | undefined>;
  getGroupEvents(groupKey: string): Promise<HealthGroupEventRecord[]>;
  claimGroup(groupKey: string): Promise<boolean>;
  closeGroup(groupKey: string): Promise<void>;
  reopenGroup(groupKey: string): Promise<void>;
}

export interface HealthTimerDependencies {
  repository: HealthTimerRepository;
  logger?: Logger;
}

interface StoredHealthEvent {
  readonly account?: string;
  readonly detail?: {
    readonly eventTypeCode?: string;
  };
}

/**
 * Verwerkt timerberichten voor gegroepeerde AWS Health-events.
 */
export class HealthTimerHandler {
  private readonly logger: Logger;

  constructor(private readonly dependencies: HealthTimerDependencies) {
    this.logger = dependencies.logger ?? new Logger({
      serviceName: 'aws-health-grouping-timer',
    });
  }

  async handle(event: SQSEvent) {
    this.logger.info('Health timer flow: received SQS batch', {
      recordCount: event.Records.length,
    });

    for (const record of event.Records) {
      const timerMessage = this.parseTimerMessage(record);
      this.logger.appendKeys({
        groupKey: timerMessage.groupKey,
        scheduledAt: timerMessage.scheduledAt,
        messageId: record.messageId,
        receiveCount: record.attributes.ApproximateReceiveCount,
      });

      try {
        this.logger.info('Health timer flow: parsed SQS timer message');
        const group = await this.dependencies.repository.getGroup(timerMessage.groupKey);
        const events = await this.dependencies.repository.getGroupEvents(timerMessage.groupKey);
        const uniqueAccounts = Array.from(new Set(events.map(groupEvent => groupEvent.account)));
        const shouldSendGroupedMessage = events.length > 1;

        this.logger.info('Health timer flow: loaded group state', {
          groupFound: !!group,
          groupStatus: group?.status,
          eventCount: events.length,
          uniqueAccountCount: uniqueAccounts.length,
        });

        if (!group) {
          this.logger.warn('Health timer flow: group not found for timer message');
          continue;
        }

        if (group.status === 'closed') {
          this.logger.info('Health timer flow: skipping closed group');
          continue;
        }

        const claimed = await this.dependencies.repository.claimGroup(timerMessage.groupKey);
        if (!claimed) {
          this.logger.info(shouldSendGroupedMessage
            ? 'Health timer flow: skipping grouped send because the group is no longer open'
            : 'Health timer flow: skipping single-event group because it is no longer open');
          continue;
        }

        if (!shouldSendGroupedMessage) {
          this.logger.info('Health timer flow: claimed single-event group for closure');
          await this.dependencies.repository.closeGroup(timerMessage.groupKey);
          this.logger.info('Health timer flow: closed single-event group without grouped message');
          continue;
        }

        this.logger.info('Health timer flow: claimed group for grouped message processing');

        try {
          const groupedEvent = events[0]?.event as StoredHealthEvent;
          const accountNames = uniqueAccounts.sort();
          const slackMessage = new GroupedHealthMessageFormatter({
            accountNames,
            eventCount: events.length,
            event: groupedEvent,
          }).format();
          await slackMessage.send(groupedHealthPriority);
          this.logger.info('Health timer flow: sent grouped Slack message', {
            priority: groupedHealthPriority,
          });
          await this.dependencies.repository.closeGroup(timerMessage.groupKey);
          this.logger.info('Health timer flow: closed group after grouped Slack message');

          this.logger.info('Health timer flow: completed grouped processing', {
            eventCount: events.length,
            uniqueAccountCount: uniqueAccounts.length,
            priority: groupedHealthPriority,
          });
        } catch (error) {
          // Voor nu laten we de groep hier bewust niet heropenen.
          // Anders kan een retry na een geslaagde grouped Slack-send nogmaals hetzelfde bericht sturen.
          // Bij drie retries kun je dan in het slechtste geval drie grouped berichten krijgen.
          // Dan zien we nu liever in het uiterste geval alleen een FIRST-bericht of een blijvende claimed status.
          // await this.dependencies.repository.reopenGroup(timerMessage.groupKey);
          this.logger.warn('Health timer flow: grouped processing failed while group remains claimed');
          throw error;
        }
      } finally {
        this.logger.resetKeys();
      }
    }
  }

  private parseTimerMessage(record: SQSRecord): HealthTimerMessage {
    const message = JSON.parse(record.body) as HealthTimerMessage;

    if (!message.groupKey) {
      throw new Error('Health timer message missing required field: groupKey');
    }

    if (!message.scheduledAt) {
      throw new Error('Health timer message missing required field: scheduledAt');
    }

    return message;
  }
}
