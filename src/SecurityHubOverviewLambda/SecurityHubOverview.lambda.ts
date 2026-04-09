import { AwsSecurityFinding, SecurityHubClient } from '@aws-sdk/client-securityhub';
import { deploymentEnvironments } from '../DeploymentEnvironments';
import { SecurityHubService } from './SecurityHubService';
import { SlackMessage } from '../monitoringLambda/SlackMessage';

const MAX_FINDINGS_PER_CRITICALITY = 50;

const securityHubService = new SecurityHubService(
  new SecurityHubClient({ region: process.env.AWS_REGION }),
);

export async function handler() {
  try {
    await sendOverviewToSlack();
  } catch (error) {
    console.error(error);
    const message = new SlackMessage();
    message.addSection('⚠ Could not send SecurityHub overview to Slack, check logs');
    await message.send('high');
  }
}

async function sendOverviewToSlack() {
  const message = new SlackMessage();
  message.addHeader('SecurityHub finding overview');

  console.info('Collecting findings...');
  const criticalFindings = await securityHubService.getActiveFindings('CRITICAL');
  const highFindings = await securityHubService.getActiveFindings('HIGH');

  console.info('Formatting CRITICAL findings...');
  addFindingsSection(message, '❗️ Critical findings', criticalFindings);
  console.info('Formatting HIGH findings...');
  addFindingsSection(message, '⚠️ High findings', highFindings);

  console.info('Sending message...');
  console.debug('Message', JSON.stringify(message.getSlackMessage()));
  await message.send('high');
}

function isContainerFinding(finding: AwsSecurityFinding): boolean {
  return finding.Resources?.some(r => r.Type === 'AwsEcrContainerImage') ?? false;
}

function addFindingsSection(message: SlackMessage, header: string, findings: AwsSecurityFinding[]) {
  if (findings.length === 0) return;

  const containerCount = findings.filter(isContainerFinding).length;
  const otherFindings = findings.filter(f => !isContainerFinding(f));

  message.addSection(header);

  // No findings
  if (containerCount == 0 && otherFindings.length == 0) {
    message.addSection('✅ No findings');
    return;
  }

  // Compile all other findings into a string (truncate at 50 findings)
  const otherFindingsMessage: string[] = [];
  if (otherFindings.length > 0) {
    otherFindings.splice(0, MAX_FINDINGS_PER_CRITICALITY).forEach(finding => {
      const accountName = lookupAccountName(finding.AwsAccountId);
      otherFindingsMessage.push(`${finding.Title} (${accountName}, ${finding.ProductName ?? 'unknown product'})`);
    });

    if (otherFindings.length > MAX_FINDINGS_PER_CRITICALITY) {
      otherFindingsMessage.push(`... and ${otherFindings.length - MAX_FINDINGS_PER_CRITICALITY} more findings`);
    }
    message.addSection(otherFindingsMessage.join('\n'));
  }

  // Add container finding count
  if (containerCount > 0) {
    message.addSection(`There are ${containerCount} ${header.toLowerCase().replace(/[^a-z ]/g, '').trim()} in container images in ECR repositories.`);
  }
}

function lookupAccountName(account?: string) {
  if (!account) { return 'undefined account'; }
  const configuration = deploymentEnvironments[process.env.BRANCH_NAME ?? 'main'];
  const accountConfig = configuration?.deployToEnvironments.find(config => config.env.account == account);
  return accountConfig?.accountName ?? account;
}
