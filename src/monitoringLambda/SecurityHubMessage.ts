import { Configuration } from '../DeploymentEnvironments';
import { Message } from './Message';
import { SecurityHubView } from './SecurityHubView';
import { FindingRef, SUPPRESS_ACTION_ID } from '../securityHubActions/shared/ActionPayload';

const MAX_SECTION_LENGTH = 3000;
const MAX_RESOURCE_LINES = 10;

export interface RenderOptions {
  accountName: string;
  button?: FindingRef;
  notice?: string;
  outcome?: { status: string; by?: string; reason?: string };
}

/**
 * Escape the characters Slack treats as control characters in mrkdwn text.
 */
export function escapeSlackText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function findingConsoleUrl(region: string, findingId: string): string {
  const encodedId = encodeURIComponent(encodeURIComponent(findingId));
  return `https://${region}.console.aws.amazon.com/securityhub/home?region=${region}#/findings?search=Id%3D%255Coperator%255C%253AEQUALS%255C%253A${encodedId}`;
}

/**
 * Name of the account in the deployment configuration, or the id when unknown.
 */
export function accountNameFor(configuration: Configuration, accountId: string): string {
  const environment = configuration.deployToEnvironments.find(deploymentEnv => deploymentEnv.env.account == accountId);
  return environment?.accountName ?? accountId;
}

/**
 * Only https targets are linked; characters that Slack treats as link syntax are percent-encoded.
 */
function safeLinkTarget(target?: string): string | undefined {
  if (!target || !target.startsWith('https://')) { return undefined; }
  return target.replace(/[<>| ]/g, char => encodeURIComponent(char));
}

function truncate(text: string): string {
  return text.length > MAX_SECTION_LENGTH ? `${text.substring(0, MAX_SECTION_LENGTH - 1)}…` : text;
}

export function renderSecurityHubView(message: Message, view: SecurityHubView, opts: RenderOptions): Message {
  message.addHeader(`SecurityHub: ${view.title}`);

  const context: { [name: string]: string } = {};
  const candidates: [string, string | undefined][] = [
    ['severity', view.severity],
    ['account', opts.accountName],
    ['region', view.region],
    ['compliance', view.complianceStatus],
    ['workflow', view.workflowStatus],
    ['control', view.controlId],
    ['standard', view.standard],
  ];
  for (const [key, value] of candidates) {
    if (value) { context[key] = escapeSlackText(value); }
  }
  message.addContext(context);

  if (view.description) {
    message.addSection(truncate(escapeSlackText(view.description)));
  }

  if (view.resources.length > 0) {
    const lines = view.resources
      .slice(0, MAX_RESOURCE_LINES)
      .map(resource => `- *${escapeSlackText(resource.type)}*: ${escapeSlackText(resource.id)}`);
    if (view.resources.length > MAX_RESOURCE_LINES) {
      lines.push(`...and ${view.resources.length - MAX_RESOURCE_LINES} more`);
    }
    message.addSection(truncate(lines.join('\n')));
  }

  const vulnerability: string[] = [];
  if (view.fixAvailable) { vulnerability.push(`Fix available: *${escapeSlackText(view.fixAvailable)}*`); }
  if (view.exploitAvailable) { vulnerability.push(`Exploit available: *${escapeSlackText(view.exploitAvailable)}*`); }
  if (vulnerability.length > 0) {
    message.addSection(vulnerability.join(' | '));
  }

  const remediationTarget = safeLinkTarget(view.remediationUrl);
  if (remediationTarget) {
    message.addLink('Remediation', remediationTarget);
  }
  if (view.findingId && view.region) {
    message.addLink('View in Security Hub', findingConsoleUrl(view.region, view.findingId));
  }

  if (opts.notice) {
    message.addSection(truncate(escapeSlackText(opts.notice)));
  }

  if (opts.outcome) {
    const { status, by, reason } = opts.outcome;
    const byText = by ? ` by ${escapeSlackText(by)}` : '';
    const reasonText = reason ? `: ${escapeSlackText(reason)}` : '';
    message.addSection(truncate(`*${escapeSlackText(status)}*${byText}${reasonText}`));
  } else if (opts.button) {
    message.addButton('Suppress', SUPPRESS_ACTION_ID, opts.button);
  }

  return message;
}
