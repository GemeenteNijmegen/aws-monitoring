import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { Environment } from 'aws-cdk-lib';
import { ScheduledEvent } from 'aws-lambda';
import { CloudWatchInsightsQuery, CloudWatchInsightsQueryProps, CloudWatchInsightsQueryResult } from './Query';
import { QueryFormatter } from './QueryFormatter';
import { DeploymentEnvironment, getConfiguration } from '../DeploymentEnvironments';
import { SlackMessage } from '../monitoringLambda/SlackMessage';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const sts = new STSClient({ region: process.env.AWS_REGION });

interface QueryExecutionResult {
  message: string;
  queryResult?: CloudWatchInsightsQueryResult;
}

export async function handler(_event: ScheduledEvent) {
  try {

    const deploymentConfiguration = getConfiguration(process.env.BRANCH_NAME ?? '');
    console.log('Starting log query job using configuration for branch:', process.env.BRANCH_NAME);
    console.log('Deployment configuration used:', JSON.stringify(deploymentConfiguration, null, 2));
    await runLogQueryJob(deploymentConfiguration.deployToEnvironments);

  } catch (error) {
    console.error('Unhandled error in handler');
    console.error(error);
    await sendNotificationToSlack('❗️ Unhandled error during CloudWatch logs queries');
  }
}

async function runLogQueryJob(deploymentConfiguration: DeploymentEnvironment[]) {

  const timestamp = new Date().toISOString();
  const queries: Promise<QueryExecutionResult>[] = [];

  deploymentConfiguration.forEach(configuration => {
    if (!configuration.queryDefinitions) {
      return;
    }
    configuration.queryDefinitions.forEach(queryDefiniton => {
      queries.push(executeQuery(configuration.env, queryDefiniton, timestamp));
    });
  });

  const results = await Promise.all(queries);

  await Promise.all([
    makeReport(results, timestamp),
    notifySlack(results, timestamp),
  ]);
}

async function executeQuery(environment: Environment, queryDefinition: CloudWatchInsightsQueryProps, timestamp: string): Promise<QueryExecutionResult> {

  console.log('Starting query', queryDefinition.name, environment.account);

  // Get account and region
  const account = environment.account;
  const region = queryDefinition.region ?? environment.region;
  if (!account || !region) {
    console.log('Could not execute, missing account or region', account, region);
    return {
      message: `❗️ ${queryDefinition.name} could not be executed. Missing account or region. Account: ${account}, Region: ${region}`,
    };
  }

  try {
    const logsClient = await getLogClientForAccount(account, region);
    const query = new CloudWatchInsightsQuery(queryDefinition, logsClient);
    await query.run();
    await storeQueryResultInS3(query, timestamp);
    console.log('Finished query', queryDefinition.name, environment.account);
    return {
      message: `✅ ${queryDefinition.name} executed successfully`,
      queryResult: query.getResults(),
    };
  } catch (error) {
    console.error('Error while executing query', queryDefinition.name, environment.account);
    console.error(error);
    return {
      message: `❗️ ${queryDefinition.name} could not be executed. ${error}`,
    };
  }


}

async function notifySlack(results: QueryExecutionResult[], timestamp: string) {
  const messages = results.map(r => r.message);
  messages.push(`💾 Log query job finished`);
  messages.push(`results are stored in ${process.env.LOG_QUERIES_RESULT_BUCKET_NAME} bucket (in directory /${timestamp}/)`);
  console.log(messages);
  await sendNotificationToSlack(messages);
}

async function makeReport(results: QueryExecutionResult[], timestamp: string) {
  // hack: make any otherswise typechecker prevents us from using this list after filtering out undefined values
  const queryResults: any = results.filter(r => r.queryResult != undefined).map(r => r.queryResult);
  const html = QueryFormatter.renderAsHtmlReport(queryResults);
  await storeInS3(html, 'report.html', timestamp);
}


// Utility methods below

async function storeQueryResultInS3(query: CloudWatchInsightsQuery, timestamp: string) {
  const queryResults = query.getResults();
  let result = undefined;
  if (queryResults) {
    result = QueryFormatter.format(queryResults);
  } else {
    result = JSON.stringify({ message: 'No results found' }, null, 4);
  }

  await storeInS3(result, `${query.settings.name}.txt`, timestamp);
}

async function storeInS3(value: string, name: string, timestamp: string) {
  const key = `${timestamp}/${name}`;
  const command = new PutObjectCommand({
    Bucket: process.env.LOG_QUERIES_RESULT_BUCKET_NAME,
    Key: key,
    Body: value,
  });
  await s3.send(command);
}

async function getLogClientForAccount(accountId: string, region: string) {
  const assumedRole = await sts.send(new AssumeRoleCommand({
    RoleArn: `arn:aws:iam::${accountId}:role/${process.env.LOG_QUERY_ROLE_NAME}`,
    RoleSessionName: 'LogQueryJob',
    DurationSeconds: 3600,
  }));

  if (!assumedRole || !assumedRole.Credentials?.AccessKeyId || !assumedRole.Credentials?.SecretAccessKey) {
    throw Error('Could not assume role for log query job');
  }

  const logsClient = new CloudWatchLogsClient({
    region: region,
    credentials: {
      accessKeyId: assumedRole.Credentials.AccessKeyId,
      secretAccessKey: assumedRole.Credentials.SecretAccessKey,
      sessionToken: assumedRole.Credentials.SessionToken,
      expiration: assumedRole.Credentials.Expiration,
    },
  });

  return logsClient;
}

async function sendNotificationToSlack(result: string | string[]) {
  try {
    const message = new SlackMessage();
    message.addHeader('Scheduled log query job');
    if (Array.isArray(result)) {
      result.forEach(r => message.addSection(r));
    } else {
      message.addSection(result);
    }
    await message.send('high');
  } catch (error) {
    console.error(error);
  }
}
