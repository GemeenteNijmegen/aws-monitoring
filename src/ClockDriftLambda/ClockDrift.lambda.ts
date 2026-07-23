import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { ScheduledEvent } from 'aws-lambda';
import { checkClockDrift, ClockDriftResult } from './ClockDriftCheck';
import { Statics } from '../statics';

const cloudwatch = new CloudWatchClient({ region: process.env.AWS_REGION });
const sns = new SNSClient({ region: process.env.AWS_REGION });

/**
 * This lambda has one job: verify that its own execution context clock
 * (`Date.now()`) matches real time. We had an incident where a JWT-issuing
 * lambda's `iat` claim was ~20 minutes off because the execution environment's
 * clock had drifted - this lambda is a canary to notice if/how often that
 * happens, across accounts.
 *
 * Every run records the measured drift as a CloudWatch metric (so trends are
 * visible even below the alert margin), and only sends a Slack alert via the
 * existing monitoring pipeline when the drift exceeds the configured margin.
 */
export async function handler(event: ScheduledEvent) {
  const region = process.env.AWS_REGION ?? 'eu-central-1';
  const referenceHost = process.env.REFERENCE_HOST ?? `sts.${region}.amazonaws.com`;
  const marginMs = Number(process.env.MARGIN_MS ?? 60_000);
  const accountName = process.env.ACCOUNT_NAME ?? 'unknown';

  const result = await checkClockDrift({ referenceHost, eventTime: event?.time });
  console.info('Clock drift check result', JSON.stringify(result));

  await publishMetric(accountName, result.driftMs);

  if (Math.abs(result.driftMs) > marginMs) {
    await publishAlert(accountName, result, marginMs);
  }
}

async function publishMetric(accountName: string, driftMs: number) {
  try {
    await cloudwatch.send(new PutMetricDataCommand({
      Namespace: 'AwsMonitoring/ClockDrift',
      MetricData: [{
        MetricName: 'DriftMilliseconds',
        Value: driftMs,
        Unit: StandardUnit.Milliseconds,
        Dimensions: [{ Name: 'Account', Value: accountName }],
      }],
    }));
  } catch (error) {
    // A failed metric publish should not break the alert check below.
    console.error('Failed to publish clock drift metric', error);
  }
}

async function publishAlert(accountName: string, result: ClockDriftResult, marginMs: number) {
  const direction = result.driftMs > 0 ? 'ahead of' : 'behind';
  const message = {
    messageType: Statics.mpaMonitoringEventMessageType,
    title: '⏰ Clock drift detected',
    message: `Lambda execution context clock is ${Math.abs(result.driftMs)}ms ${direction} real time `
      + `(margin: ${marginMs}ms). This can cause issues like incorrect JWT timestamps.`,
    context: {
      Account: accountName,
      ReferenceSource: result.referenceHost,
      ...(result.eventBridgeDriftMs !== undefined ? { EventBridgeDriftMs: String(result.eventBridgeDriftMs) } : {}),
    },
  };
  console.info('Drift exceeds margin, publishing alert', JSON.stringify(message));
  await sns.send(new PublishCommand({
    TopicArn: process.env.SNS_TOPIC_ARN,
    Subject: 'ClockDriftMonitor',
    Message: JSON.stringify(message),
  }));
}
