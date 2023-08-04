import { ScheduledEvent } from 'aws-lambda';
import { SlackMessage } from '../monitoringLambda/SlackMessage';
import { DeploymentEnvironment, deploymentEnvironments } from '../DeploymentEnvironments';
import { CloudWatchInsightsQuery } from './Query';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const s3 = new S3Client({ region: process.env.AWS_REGION });

export async function handler(_event: ScheduledEvent) {
  try {
    const errors = await runLogQueryJob(deploymentEnvironments);
    if(errors.length > 0){
      await sendNotificationToSlack(`❗️ Error during CloudWatch logs queries: \n ${errors.join('\n - ')}`);
      return;
    }
    await sendNotificationToSlack('✅ CloudWatch logs queries completed');
  } catch (error) {
    console.error(error);
    await sendNotificationToSlack('❗️ Unhandled error during CloudWatch logs queries');
  }
}

async function sendNotificationToSlack(text: string){
  try {
    const message = new SlackMessage();
    message.addHeader('Scheduled log query job')
    message.addSection(text);
    await message.send('critical');
  } catch (error) {
    console.error(error);
  }
}

async function runLogQueryJob(deploymentEnvironments: DeploymentEnvironment[]) {

  const errors: string[] = [];
  const timestamp = new Date().toISOString();

  // Get all query definitions from all deployment environments
  const queries: CloudWatchInsightsQuery[] = [];
  deploymentEnvironments.forEach(deploymentEnvironment => {
    if(deploymentEnvironment.queryDefinitons){
      deploymentEnvironment.queryDefinitons.forEach(queryDefiniton => {
        queries.push(new CloudWatchInsightsQuery(queryDefiniton));
      });
    }
  });

  // Run all query definitions and store results in s3
  queries.forEach(async query => {
    try {
      await query.run()
      await storeQueryResultInS3(query, timestamp);
    } catch (error) {
      const msg = `Could not complete query ${query.settings.name}`
      console.log(msg);
      errors.push(msg);
    }
  });

  return errors;
}

async function storeQueryResultInS3(query: CloudWatchInsightsQuery, timestamp: string) {
  const key = `${timestamp}/${query.settings.name}/logs.txt`;

  let result = undefined;
  if(query.getResults()){
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