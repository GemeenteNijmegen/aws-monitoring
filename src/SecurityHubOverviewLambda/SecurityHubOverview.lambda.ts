import { SecurityHubClient, GetFindingsCommand } from '@aws-sdk/client-securityhub';
import { ScheduledEvent } from 'aws-lambda';
import { SlackMessage } from '../monitoringLambda/SlackMessage';
import { getConfiguration } from '../DeploymentEnvironments';

const securityHubClient = new SecurityHubClient({ region: process.env.AWS_REGION });

export async function handler(_event: ScheduledEvent) {

  // Send to slack
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

  const criticalFindings = await getFindingsWithSeverity('CRITICAL');
  if (criticalFindings && criticalFindings.length > 0) {
    message.addSection('❗️ Critical findings');
    criticalFindings.forEach(finding => {
      const accountName = lookupAccountName(finding.AwsAccountId ?? 'unknown account');
      message.addSection(`${finding.Title} (${accountName}, ${finding.ProductName ?? 'unknown product'})`);
    });
  }

  const highFindings = await getFindingsWithSeverity('HIGH');
  if (highFindings && highFindings.length > 0) {
    message.addSection('⚠️ High findings');
    highFindings.forEach(finding => {
      const accountName = lookupAccountName(finding.AwsAccountId ?? 'unknown account');
      message.addSection(`${finding.Title} (${accountName}, ${finding.ProductName ?? 'unknown product'})`);
    });
  }

  if (!criticalFindings && !highFindings) {
    message.addSection('✅ No high or critical findings');
  }

  await message.send('high');
}


async function getFindingsWithSeverity(severityLabel: 'CRITICAL' | 'HIGH') {

  const command = new GetFindingsCommand({
    Filters: {
      SeverityLabel: [{
        Comparison: 'EQUALS',
        Value: severityLabel,
      }],
      WorkflowStatus: [ // Show new and notified findings
        {
          Comparison: 'EQUALS',
          Value: 'NEW',
        },
        {
          Comparison: 'EQUALS',
          Value: 'NOTIFIED',
        },
      ],
      RecordState: [{ // Only show active findings
        Comparison: 'EQUALS',
        Value: 'ACTIVE',
      }],
    },
  });

  try {
    const resp = await securityHubClient.send(command);
    return resp.Findings;
  } catch (error) {
    console.error(error);
    throw Error('Could not get findings, check logs');
  }
}

/**
 * Use the deployment environments in this project
 * to retreive the account name
 * @param account
 * @returns
 */
function lookupAccountName(account: string) {
  try {
    const configuration = getConfiguration(process.env.BRANCH_NAME ?? 'main-new-lz');
    const monitoringConfig = configuration.deployToEnvironments.find(deploymentEnv => deploymentEnv.env.account == account);
    return monitoringConfig?.accountName ?? account;
  } catch {
    return account;
  }
}