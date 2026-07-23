import { getConfiguration } from '../../DeploymentEnvironments';
import { Message } from '../../monitoringLambda/Message';
import { SlackMessage } from '../../monitoringLambda/SlackMessage';

const MAX_GROUPED_ACCOUNT_NAMES = 5;

interface HealthDescription {
  readonly latestDescription?: string;
}

interface HealthEventDetail {
  readonly eventTypeCode?: string;
  readonly eventDescription?: HealthDescription[];
}

interface HealthEventMessageInput {
  readonly account?: string;
  readonly detail?: HealthEventDetail;
}

export interface GroupedHealthMessageInput {
  readonly accountNames: string[];
  readonly eventCount: number;
  readonly event: HealthEventMessageInput;
}

/**
 * Formatteert het eerste losse Health-bericht voor Slack.
 */
export class FirstHealthMessageFormatter {
  constructor(private readonly event: HealthEventMessageInput) {
  }

  format(): SlackMessage {
    const message = new Message();
    message.addHeader(`[FIRST] Health Dashboard alert: ${this.event.detail?.eventTypeCode ?? 'AWS Health Event'}`);
    message.addContext({
      type: 'AWS Health Event',
      account: lookupAccountName(this.event.account),
    });
    message.addSection(eventDescription(this.event));
    // TODO: voeg pas een link toe als we een betrouwbare deep link naar het juiste Health-event hebben.
    return message.getSlackMessage();
  }
}

/**
 * Formatteert het gegroepeerde Health-bericht voor Slack.
 */
export class GroupedHealthMessageFormatter {
  constructor(private readonly input: GroupedHealthMessageInput) {
  }

  format(): SlackMessage {
    const message = new Message();
    message.addHeader(`[GROUPED] Health Dashboard alert: ${this.input.event.detail?.eventTypeCode ?? 'AWS Health Event'}`);
    message.addContext({
      type: 'AWS Health Event',
      accounts: `${this.input.accountNames.length}`,
      events: `${this.input.eventCount}`,
    });
    message.addSection(eventDescription(this.input.event));
    message.addSection(groupedAccountSection(this.input.accountNames));
    // TODO: voeg pas een link toe als we een betrouwbare deep link naar het juiste Health-event hebben.
    return message.getSlackMessage();
  }
}

function eventDescription(event: HealthEventMessageInput): string {
  return event.detail?.eventDescription?.[0]?.latestDescription?.replace('\\n', '\n') ?? 'AWS Health notification';
}

function lookupAccountName(account: string | undefined): string {
  if (!account) {
    return 'unknown';
  }

  const configuration = getConfiguration(process.env.BRANCH_NAME ?? 'main');
  const match = configuration.deployToEnvironments.find(deploymentEnv => deploymentEnv.env.account === account);
  return match?.accountName ?? account;
}

function groupedAccountSection(accountNames: string[]): string {
  const accountCountLine = `Accounts: ${accountNames.length}`;

  if (accountNames.length <= MAX_GROUPED_ACCOUNT_NAMES) {
    return `${accountCountLine}\n - ${accountNames.join('\n - ')}`;
  }

  const visibleAccounts = accountNames.slice(0, MAX_GROUPED_ACCOUNT_NAMES);
  const remainingCount = accountNames.length - visibleAccounts.length;
  return `${accountCountLine}\n - ${visibleAccounts.join('\n - ')}\n - (+${remainingCount} more)`;
}
