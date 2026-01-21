import { Duration } from 'aws-cdk-lib';
import { LambdaIntegration, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
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

  constructor(scope: Construct, id: string, private readonly props: AuditSupportProps) {
    super(scope, id);
    this.setupSlackCommands();
    this.setupArchiver();
  }


  setupSlackCommands() {
    const commandsTable = new Table(this, `commands-table-${this.props.environment}`, {
      partitionKey: {
        name: 'messageId',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      tableName: `slack-commands-${this.props.environment}`,
      timeToLiveAttribute: 'expiresAt',
    });

    const slackSecret = new Secret(this, `slackbot-secret-${this.props.environment}`, {
      description: 'Secret for slackbot app',
    });

    const slackbot = new SlackbotFunction(this, 'slackbot', {
      description: 'Slackbot backend',
      environment: {
        SLACK_SECRET_ARN: slackSecret.secretArn,
        COMMANDS_TABLE_NAME: commandsTable.tableName,
      },
    });

    slackSecret.grantRead(slackbot);
    commandsTable.grantWriteData(slackbot);

    const slack = this.props.api.root.addResource('slackbot');
    slack.addMethod('POST', new LambdaIntegration(slackbot));
  }

  setupArchiver() {
    const archiveTable = new Table(this, `archive-table-${this.props.environment}`, {
      partitionKey: {
        name: 'commandId',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      tableName: `slack-archive-${this.props.environment}`,
    });

    const archiveBucket = new Bucket(this, `archive-bucket-${this.props.environment}`, {
      bucketName: `slack-archive-${this.props.environment}`,
      encryption: BucketEncryption.S3_MANAGED,
    });

    const commandsTable = Table.fromTableName(this, `commands-table-ref-${this.props.environment}`, `slack-commands-${this.props.environment}`);

    const slackTokenSecret = new Secret(this, `slack-token-secret-${this.props.environment}`, {
      description: 'Slack bot token for API access',
    });

    const archiverFunction = new ArchiverFunction(this, 'archiver', {
      description: 'Archives Slack threads to S3',
      timeout: Duration.minutes(15),
      environment: {
        COMMANDS_TABLE_NAME: commandsTable.tableName,
        ARCHIVE_TABLE_NAME: archiveTable.tableName,
        ARCHIVE_BUCKET_NAME: archiveBucket.bucketName,
        SLACK_TOKEN_ARN: slackTokenSecret.secretArn,
      },
    });

    commandsTable.grantReadData(archiverFunction);
    archiveTable.grantReadWriteData(archiverFunction);
    archiveBucket.grantWrite(archiverFunction);
    slackTokenSecret.grantRead(archiverFunction);

    new Rule(this, `archiver-schedule-${this.props.environment}`, {
      schedule: Schedule.rate(Duration.hours(1)),
      targets: [new LambdaFunction(archiverFunction)],
    });
  }

}