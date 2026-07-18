export interface AwsHealthEvent {
  readonly account?: string;
  readonly detail?: {
    readonly eventArn?: string;
    readonly communicationId?: string;
    readonly page?: string;
    readonly totalPages?: string;
  };
}

export interface HealthGroupIdentity {
  readonly groupKey: string;
  readonly eventArn: string;
  readonly communicationId: string;
}

/**
 * Bepaalt de technische groepssleutel voor AWS Health-berichten.
 * Berichten met dezelfde communicationId binnen hetzelfde eventArn horen functioneel bij dezelfde communicatie.
 */
export function createHealthGroupIdentity(event: AwsHealthEvent): HealthGroupIdentity {
  const eventArn = requiredIdentifier(event.detail?.eventArn, 'detail.eventArn');
  const communicationId = requiredIdentifier(event.detail?.communicationId, 'detail.communicationId');
  const groupKey = `${eventArn}#${communicationId}`;

  return {
    groupKey,
    eventArn,
    communicationId,
  };
}

function requiredIdentifier(value: string | undefined, name: string): string {
  if (!value || value.trim() === '') {
    throw new Error(`AWS Health event missing required identifier: ${name}`);
  }
  return value;
}
