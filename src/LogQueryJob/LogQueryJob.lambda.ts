import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { ScheduledEvent } from 'aws-lambda';
import { CloudWatchInsightsQuery } from './Query';
import { DeploymentEnvironment, deploymentEnvironments } from '../DeploymentEnvironments';
import { SlackMessage } from '../monitoringLambda/SlackMessage';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const sts = new STSClient({ region: process.env.AWS_REGION });

export async function handler(_event: ScheduledEvent) {
  try {
    const errors = await runLogQueryJob(deploymentEnvironments);
    if (errors.length > 0) {
      await sendNotificationToSlack(`❗️ Error during CloudWatch logs queries: \n ${errors.join('\n - ')}`);
      return;
    }
    await sendNotificationToSlack('✅ CloudWatch logs queries completed');
  } catch (error) {
    console.error(error);
    await sendNotificationToSlack('❗️ Unhandled error during CloudWatch logs queries');
  }
}

async function sendNotificationToSlack(text: string) {
  try {
    const message = new SlackMessage();
    message.addHeader('Scheduled log query job');
    message.addSection(text);
    await message.send('critical');
  } catch (error) {
    console.error(error);
  }
}

async function runLogQueryJob(deploymentConfiguration: DeploymentEnvironment[]) {

  const assumedRole = await sts.send(new AssumeRoleCommand({
    RoleArn: process.env.LOG_QUERY_ROLE_ARN,
    RoleSessionName: 'LogQueryJob',
    DurationSeconds: 800, // Around max runtime of the lambda anyway
  }));

  if (!assumedRole || !assumedRole.Credentials?.AccessKeyId || !assumedRole.Credentials?.SecretAccessKey) {
    throw Error('Could not assume role for log query job');
  }

  const logsClient = new CloudWatchLogsClient({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: assumedRole.Credentials.AccessKeyId,
      secretAccessKey: assumedRole.Credentials.SecretAccessKey,
      sessionToken: assumedRole.Credentials.SessionToken,
      expiration: assumedRole.Credentials.Expiration,
    },
  });

  const errors: string[] = [];
  const timestamp = new Date().toISOString();

  // Get all query definitions from all deployment environments
  const queries: CloudWatchInsightsQuery[] = [];
  deploymentConfiguration.forEach(configuration => {
    if (configuration.queryDefinitons) {
      configuration.queryDefinitons.forEach(queryDefiniton => {
        queries.push(new CloudWatchInsightsQuery(queryDefiniton, logsClient));
      });
    }
  });

  // Run all query definitions and store results in s3
  queries.forEach(async query => {
    try {
      await query.run();
      await storeQueryResultInS3(query, timestamp);
    } catch (error) {
      const msg = `Could not complete query ${query.settings.name}`;
      console.log(msg);
      errors.push(msg);
    }
  });

  return errors;
}

async function storeQueryResultInS3(query: CloudWatchInsightsQuery, timestamp: string) {
  const key = `${timestamp}/${query.settings.name}/logs.txt`;

  let result = undefined;
  if (query.getResults()) {
    result = JSON.stringify(result, null, 4);
  } else {
    result = JSON.stringify({ message: 'No results found' }, null, 4);
  }

  const command = new PutObjectCommand({
    Bucket: process.env.LOG_QUERIES_RESULT_BUCKET_NAME,
    Key: key,
    Body: result,
  });

  await s3.send(command);

}