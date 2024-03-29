import { SecurityHubClient, GetFindingsCommand } from '@aws-sdk/client-securityhub';
import { ScheduledEvent } from 'aws-lambda';
import { deploymentEnvironments } from '../DeploymentEnvironments';
import { SlackMessage } from '../monitoringLambda/SlackMessage';

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
  const criticalFindingsFound = criticalFindings && criticalFindings.length > 0;
  if (criticalFindingsFound) {
    message.addSection('❗️ Critical findings');
    criticalFindings.forEach(finding => {
      const accountName = lookupAccountName(finding.AwsAccountId);
      message.addSection(`${finding.Title} (${accountName}, ${finding.ProductName ?? 'unknown product'})`);
    });
  }

  const highFindings = await getFindingsWithSeverity('HIGH');
  const highFindingsFound = highFindings && highFindings.length > 0;
  if (highFindingsFound) {
    message.addSection('⚠️ High findings');
    highFindings.forEach(finding => {
      const accountName = lookupAccountName(finding.AwsAccountId);
      message.addSection(`${finding.Title} (${accountName}, ${finding.ProductName ?? 'unknown product'})`);
    });
  }

  if (!criticalFindingsFound && !highFindingsFound) {
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


function lookupAccountName(account?: string) {
  if (!account) { return 'undefined account';}
  const configuration = deploymentEnvironments[process.env.BRANCH_NAME ?? 'main'];
  const accountConfig = configuration?.deployToEnvironments.find(config => config.env.account == account);
  return accountConfig?.accountName ?? account;
}