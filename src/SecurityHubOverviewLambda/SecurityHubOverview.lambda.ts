import { AwsSecurityFinding, SecurityHubClient } from '@aws-sdk/client-securityhub';
import { deploymentEnvironments } from '../DeploymentEnvironments';
import { SecurityHubService } from './SecurityHubService';
import { SlackMessage } from '../monitoringLambda/SlackMessage';

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

  const criticalFindings = await securityHubService.getActiveFindings('CRITICAL');
  const highFindings = await securityHubService.getActiveFindings('HIGH');

  addFindingsSection(message, '❗️ Critical findings', criticalFindings);
  addFindingsSection(message, '⚠️ High findings', highFindings);

  if (criticalFindings.length === 0 && highFindings.length === 0) {
    message.addSection('✅ No high or critical findings');
  }

  await message.send('high');
}

function isContainerFinding(finding: AwsSecurityFinding): boolean {
  return finding.Resources?.some(r => r.Type === 'AwsEcrContainerImage') ?? false;
}

function addFindingsSection(message: SlackMessage, header: string, findings: AwsSecurityFinding[]) {
  if (findings.length === 0) return;

  const containerCount = findings.filter(isContainerFinding).length;
  const otherFindings = findings.filter(f => !isContainerFinding(f));

  if (otherFindings.length > 0) {
    message.addSection(header);
    otherFindings.forEach(finding => {
      const accountName = lookupAccountName(finding.AwsAccountId);
      message.addSection(`${finding.Title} (${accountName}, ${finding.ProductName ?? 'unknown product'})`);
    });
  }

  if (containerCount > 0) {
    message.addSection(`There were also ${containerCount} ${header.toLowerCase().replace(/[^a-z ]/g, '').trim()} in container images in ECR repositories.`);
  }
}

function lookupAccountName(account?: string) {
  if (!account) { return 'undefined account'; }
  const configuration = deploymentEnvironments[process.env.BRANCH_NAME ?? 'main'];
  const accountConfig = configuration?.deployToEnvironments.find(config => config.env.account == account);
  return accountConfig?.accountName ?? account;
}
