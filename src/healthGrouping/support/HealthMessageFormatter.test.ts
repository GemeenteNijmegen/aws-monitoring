import { FirstHealthMessageFormatter, GroupedHealthMessageFormatter } from './HealthMessageFormatter';

describe('HealthMessageFormatter', () => {
  beforeEach(() => {
    process.env.BRANCH_NAME = 'sandbox';
  });

  test('formats a FIRST health message with header, context and description', () => {
    const slackMessage = new FirstHealthMessageFormatter({
      account: '111111111111',
      detail: {
        eventTypeCode: 'AWS_BILLING_OPERATIONAL_ISSUE',
        eventDescription: [
          { latestDescription: 'Billing issue in progress' },
        ],
      },
    }).format().getSlackMessage();

    expect(slackMessage.blocks[0].text.text).toBe('[FIRST] Health Dashboard alert: AWS_BILLING_OPERATIONAL_ISSUE');
    expect(slackMessage.blocks[1].elements[0].text).toBe('type: *AWS Health Event*');
    expect(slackMessage.blocks[1].elements[1].text).toBe('account: *111111111111*');
    expect(slackMessage.blocks[2].text.text).toBe('Billing issue in progress');
  });

  test('formats a GROUPED health message with the full account list when there are five or fewer accounts', () => {
    const slackMessage = new GroupedHealthMessageFormatter({
      accountNames: ['account-a', 'account-b', 'account-c'],
      eventCount: 3,
      event: {
        detail: {
          eventTypeCode: 'AWS_BILLING_OPERATIONAL_ISSUE',
          eventDescription: [
            { latestDescription: 'Billing issue in progress' },
          ],
        },
      },
    }).format().getSlackMessage();

    expect(slackMessage.blocks[0].text.text).toBe('[GROUPED] Health Dashboard alert: AWS_BILLING_OPERATIONAL_ISSUE');
    expect(slackMessage.blocks[1].elements[1].text).toBe('accounts: *3*');
    expect(slackMessage.blocks[1].elements[2].text).toBe('events: *3*');
    expect(slackMessage.blocks[3].text.text).toBe('Accounts: 3\n - account-a\n - account-b\n - account-c');
  });

  test('formats a GROUPED health message with account count first and truncates the visible list after five accounts', () => {
    const slackMessage = new GroupedHealthMessageFormatter({
      accountNames: ['account-a', 'account-b', 'account-c', 'account-d', 'account-e', 'account-f'],
      eventCount: 6,
      event: {
        detail: {
          eventTypeCode: 'AWS_BILLING_OPERATIONAL_ISSUE',
          eventDescription: [
            { latestDescription: 'Billing issue in progress' },
          ],
        },
      },
    }).format().getSlackMessage();

    expect(slackMessage.blocks[3].text.text).toBe(
      'Accounts: 6\n - account-a\n - account-b\n - account-c\n - account-d\n - account-e\n - (+1 more)',
    );
  });
});
