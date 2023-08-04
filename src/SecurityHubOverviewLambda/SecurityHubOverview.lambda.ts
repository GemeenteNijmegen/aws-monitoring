import { SecurityHubClient, GetFindingsCommand } from '@aws-sdk/client-securityhub';
import { ScheduledEvent } from 'aws-lambda';
import { SlackMessage } from '../monitoringLambda/SlackMessage';

const securityHubClient = new SecurityHubClient({ region: process.env.AWS_REGION });

export async function handle(_event: ScheduledEvent) {

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

  message.addSection('❗️ Critical findings');
  const criticalFindings = await getFindingsWithSeverity('CRITICAL');
  if (criticalFindings && criticalFindings.length > 0) {
    criticalFindings.forEach(finding => {
      message.addSection(`${finding.Title} (${finding.AwsAccountId}, ${finding.ProductName ?? 'unknown product'})`);
    });
  }

  message.addSection('⚠️ High findings');
  const highFindings = await getFindingsWithSeverity('HIGH');
  if (highFindings && highFindings.length > 0) {
    highFindings.forEach(finding => {
      message.addSection(`${finding.Title} (${finding.AwsAccountId}, ${finding.ProductName ?? 'unknown product'})`);
    });
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