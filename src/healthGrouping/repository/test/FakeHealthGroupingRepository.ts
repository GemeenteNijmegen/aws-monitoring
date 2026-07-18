import { HealthEventRepository } from '../../healthEventLambda/HealthEventHandler';
import { HealthTimerRepository } from '../../healthTimerLambda/HealthTimerHandler';
import { HealthGroupEventRecord, HealthGroupRecord } from '../../support/HealthGroupingTypes';
import { HealthGroupIdentity } from '../../support/HealthGroupKey';

interface RepositoryEvent {
  readonly id: string;
  readonly account?: string;
  readonly time?: string;
  readonly detail?: {
    readonly affectedAccount?: string;
  };
}

export class FakeHealthGroupingRepository implements HealthEventRepository, HealthTimerRepository {
  private readonly groups = new Map<string, HealthGroupRecord>();
  private readonly events = new Map<string, HealthGroupEventRecord[]>();

  async groupExists(groupKey: string): Promise<boolean> {
    return this.groups.has(groupKey);
  }

  async createGroup(identity: HealthGroupIdentity, createdAt: string): Promise<boolean> {
    if (this.groups.has(identity.groupKey)) {
      return false;
    }

    this.groups.set(identity.groupKey, {
      groupKey: identity.groupKey,
      eventArn: identity.eventArn,
      communicationId: identity.communicationId,
      status: 'open',
      firstSeenAt: createdAt,
      lastSeenAt: createdAt,
    });
    return true;
  }

  async saveEvent(identity: HealthGroupIdentity, event: RepositoryEvent): Promise<boolean> {
    const existingEvents = this.events.get(identity.groupKey) ?? [];
    if (existingEvents.some(existingEvent => existingEvent.eventId === event.id)) {
      return false;
    }

    const eventRecord: HealthGroupEventRecord = {
      groupKey: identity.groupKey,
      eventId: event.id,
      eventArn: identity.eventArn,
      communicationId: identity.communicationId,
      account: event.account ?? 'unknown',
      affectedAccount: event.detail?.affectedAccount,
      receivedAt: event.time ?? new Date().toISOString(),
      event,
    };

    existingEvents.push(eventRecord);
    this.events.set(identity.groupKey, existingEvents);
    const group = this.groups.get(identity.groupKey);
    if (group) {
      this.groups.set(identity.groupKey, {
        ...group,
        lastSeenAt: eventRecord.receivedAt,
      });
    }
    return true;
  }

  async getGroup(groupKey: string): Promise<HealthGroupRecord | undefined> {
    return this.groups.get(groupKey);
  }

  async getGroupEvents(groupKey: string): Promise<HealthGroupEventRecord[]> {
    return this.events.get(groupKey) ?? [];
  }

  async claimGroup(groupKey: string): Promise<boolean> {
    const group = this.groups.get(groupKey);
    if (!group || group.status !== 'open') {
      return false;
    }

    this.groups.set(groupKey, {
      ...group,
      status: 'claimed',
    });
    return true;
  }

  async closeGroup(groupKey: string): Promise<void> {
    const group = this.groups.get(groupKey);
    if (!group) {
      return;
    }

    this.groups.set(groupKey, {
      ...group,
      status: 'closed',
    });
  }

  async reopenGroup(groupKey: string): Promise<void> {
    const group = this.groups.get(groupKey);
    if (!group) {
      return;
    }

    this.groups.set(groupKey, {
      ...group,
      status: 'open',
    });
  }
}
