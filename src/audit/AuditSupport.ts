import { Duration } from 'aws-cdk-lib';
import { LambdaIntegration, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { ArchiverFunction } from './archiver/archiver-function';
import { SlackbotFunction } from './slackbot/slackbot-function';

export interface AuditSupportProps {
  api: RestApi;
  /**
   * Used to separate environments (as it is all deplyed to the same AWS account)
   */
  environment: string;
}

export class AuditSupport extends Construct {

  private readonly slackSecret;
  private readonly messageTable;
  private readonly slackClientSecret;
  private readonly slackClientId;

  constructor(scope: Construct, id: string, private readonly props: AuditSupportProps) {
    super(scope, id);

    this.slackSecret = new Secret(this, `slackbot-secret-${this.props.environment}`, {
      description: 'Secret for slackbot app (used to authenticate slack requsts)',
    });
    this.slackClientSecret = new Secret(this, `slack-client-secret-${this.props.environment}`, {
      description: 'Slackbot client secret (to call slack api)',
    });
    this.slackClientId = new StringParameter(this, `slack-client-id-${this.props.environment}`, {
      description: 'Slackbot client id (to call slack api)',
      stringValue: '-',
    });

    this.messageTable = new Table(this, `message-table-${this.props.environment}`, {
      partitionKey: {
        name: 'messageId',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
    });

    this.setupSlackbot();
    this.setupArchiver();
  }


  setupSlackbot() {
    const slackbot = new SlackbotFunction(this, 'slackbot', {
      description: 'Slackbot backend',
      environment: {
        SLACK_SECRET_ARN: this.slackSecret.secretArn,
        MESSAGE_TABLE_NAME: this.messageTable.tableName,
      },
    });

    this.slackSecret.grantRead(slackbot);
    this.messageTable.grantWriteData(slackbot);

    const slack = this.props.api.root.addResource('slackbot');
    slack.addMethod('POST', new LambdaIntegration(slackbot));
  }

  setupArchiver() {
    const archiveBucket = new Bucket(this, `archive-bucket-${this.props.environment}`, {
      bucketName: `slack-archive-${this.props.environment}`,
      encryption: BucketEncryption.S3_MANAGED,
    });

    const archiverFunction = new ArchiverFunction(this, 'archiver', {
      description: 'Archives Slack threads to S3',
      timeout: Duration.minutes(15),
      environment: {
        MESSAGE_TABLE_NAME: this.messageTable.tableName,
        ARCHIVE_BUCKET_NAME: archiveBucket.bucketName,
        SLACK_CLIENT_SECRET_ARN: this.slackClientSecret.secretArn,
        SLACK_CLIENT_ID_ARN: this.slackClientId.parameterArn,
      },
    });

    this.messageTable.grantReadData(archiverFunction);
    archiveBucket.grantWrite(archiverFunction);
    this.slackClientSecret.grantRead(archiverFunction);
    this.slackClientId.grantRead(archiverFunction);

    new Rule(this, `archiver-schedule-${this.props.environment}`, {
      schedule: Schedule.rate(Duration.hours(1)),
      targets: [new LambdaFunction(archiverFunction)],
    });
  }

}