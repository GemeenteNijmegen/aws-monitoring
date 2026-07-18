import * as path from 'path';
import { AwsHealthEvent, createHealthGroupIdentity } from './HealthGroupKey';
import { parseMessageFromEvent } from '../../monitoringLambda/SnsEventHandler';
import { getEventFromFilePath } from '../../monitoringLambda/test/util';

async function getHealthMessage(sample: string): Promise<AwsHealthEvent> {
  const event = await getEventFromFilePath(path.join('..', '..', 'healthGrouping', 'samples', sample));
  return parseMessageFromEvent(event);
}

describe('createHealthGroupIdentity', () => {
  test('same communication across two accounts returns the same group key', async () => {
    const accountA = await getHealthMessage('health-public-account-a.json');
    const accountB = await getHealthMessage('health-public-account-b.json');

    const identityA = createHealthGroupIdentity(accountA);
    const identityB = createHealthGroupIdentity(accountB);

    expect(identityA.groupKey).toBe(identityB.groupKey);
  });

  test('different communicationId returns a different group key', async () => {
    const firstCommunication = await getHealthMessage('health-public-connectivity-account-a.json');
    const secondCommunication = await getHealthMessage('health-second-communication.json');

    const firstIdentity = createHealthGroupIdentity(firstCommunication);
    const secondIdentity = createHealthGroupIdentity(secondCommunication);

    expect(firstIdentity.eventArn).toBe(secondIdentity.eventArn);
    expect(firstIdentity.groupKey).not.toBe(secondIdentity.groupKey);
  });

  test('different eventArn returns a different group key', async () => {
    const billingCommunication = await getHealthMessage('health-public-account-a.json');
    const sameCommunicationDifferentEventArn: AwsHealthEvent = {
      ...billingCommunication,
      detail: {
        ...billingCommunication.detail,
        eventArn: 'arn:aws:health:global::event/BILLING/AWS_BILLING_OPERATIONAL_ISSUE/AWS_BILLING_OPERATIONAL_ISSUE_OTHER',
      },
    };

    const billingIdentity = createHealthGroupIdentity(billingCommunication);
    const otherIdentity = createHealthGroupIdentity(sameCommunicationDifferentEventArn);

    expect(billingIdentity.communicationId).toBe(otherIdentity.communicationId);
    expect(billingIdentity.groupKey).not.toBe(otherIdentity.groupKey);
  });

  test('missing required identifier throws a clear error', () => {
    expect(() => createHealthGroupIdentity({ detail: { communicationId: 'health-communication-public-1' } }))
      .toThrow('AWS Health event missing required identifier: detail.eventArn');
  });
});
