// open: groep staat nog open voor nieuwe Health-events binnen het verzamelvenster
// claimed: timer-processor heeft de groep exclusief geclaimd voor samenvatting
// closed: groep is afgerond en mag geen nieuwe Slack-flow meer starten
export type HealthGroupStatus = 'open' | 'claimed' | 'closed';

export interface HealthGroupRecord {
  readonly groupKey: string;
  readonly eventArn: string;
  readonly communicationId: string;
  readonly status: HealthGroupStatus;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly timerScheduledAt?: string;
  readonly ttl?: number;
}

export interface HealthGroupEventRecord {
  readonly groupKey: string;
  readonly eventId: string;
  readonly eventArn: string;
  readonly communicationId: string;
  readonly account: string;
  readonly affectedAccount?: string;
  readonly receivedAt: string;
  readonly ttl?: number;
  readonly event: unknown;
}

export interface HealthTimerMessage {
  readonly groupKey: string;
  readonly scheduledAt: string;
}
