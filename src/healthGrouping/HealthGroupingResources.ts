import { Duration, RemovalPolicy, aws_dynamodb as dynamodb } from 'aws-cdk-lib';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { FilterOrPolicy, ITopic, SubscriptionFilter } from 'aws-cdk-lib/aws-sns';
import { LambdaSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { getConfiguration } from '../DeploymentEnvironments';
import { Statics } from '../statics';
import { HealthEventFunction } from './healthEventLambda/healthEvent-function';
import { HealthTimerFunction } from './healthTimerLambda/healthTimer-function';

export interface HealthGroupingResourcesProps {
  readonly branchName: string;
  readonly prefix: string;
  readonly topics: ITopic[];
  readonly timerDelay?: Duration;
}

export class HealthGroupingResources extends Construct {
  readonly table: dynamodb.Table;
  readonly timerQueue: Queue;
  readonly healthEventLambda: HealthEventFunction;
  readonly healthTimerLambda: HealthTimerFunction;

  constructor(scope: Construct, id: string, props: HealthGroupingResourcesProps) {
    super(scope, id);
    this.table = this.setupHealthGroupingTable();
    this.timerQueue = this.setupHealthGroupingTimerQueue(props.timerDelay);
    this.healthEventLambda = this.setupHealthEventLambda(props.prefix, props.branchName);
    this.table.grantReadWriteData(this.healthEventLambda);
    this.subscribeHealthLambda(props.topics, this.healthEventLambda);
    this.healthTimerLambda = this.setupHealthTimerLambda(props.prefix, props.branchName);
    this.table.grantReadWriteData(this.healthTimerLambda);
    this.connectHealthQueue(this.healthEventLambda, this.healthTimerLambda, this.timerQueue);
  }

  /**
   * Table tracks health events to be grouped
   */
  private setupHealthGroupingTable() {
    return new dynamodb.Table(this, 'table', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'ttl',
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }

  private setupHealthEventLambda(prefix: string, branchName: string) {
    const healthGrouping = getConfiguration(branchName).healthGrouping;
    const lambda = new HealthEventFunction(this, 'health-event-lambda', {
      description: `AWS Health event lambda (${prefix})`,
      environment: {
        BRANCH_NAME: branchName,
        HEALTH_GROUPING_TABLE_NAME: this.table.tableName,
        HEALTH_GROUPING_TIMER_QUEUE_URL: this.timerQueue.queueUrl,
        HEALTH_GROUPING_ENABLED: `${healthGrouping?.enabled ?? false}`,
      },
    });

    return lambda;
  }

  private subscribeHealthLambda(topics: ITopic[], lambda: HealthEventFunction) {
    topics.forEach(topic => topic.addSubscription(new LambdaSubscription(lambda, {
      filterPolicyWithMessageBody: {
        'source': FilterOrPolicy.filter(SubscriptionFilter.stringFilter({ allowlist: ['aws.health'] })),
        'detail-type': FilterOrPolicy.filter(SubscriptionFilter.stringFilter({ allowlist: ['AWS Health Event'] })),
      },
    })));
  }

  private setupHealthGroupingTimerQueue(timerDelay: Duration = Duration.minutes(15)) {
    const timerDeadLetterQueue = new Queue(this, 'timer-dlq', {
      encryption: QueueEncryption.SQS_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    return new Queue(this, 'timer-queue', {
      deliveryDelay: timerDelay,
      deadLetterQueue: {
        queue: timerDeadLetterQueue,
        maxReceiveCount: 3,
      },
      encryption: QueueEncryption.SQS_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }

  private setupHealthTimerLambda(prefix: string, branchName: string) {
    const healthGrouping = getConfiguration(branchName).healthGrouping;
    const lambda = new HealthTimerFunction(this, 'health-timer-lambda', {
      description: `AWS Health timer lambda (${prefix})`,
      environment: {
        BRANCH_NAME: branchName,
        HEALTH_GROUPING_TABLE_NAME: this.table.tableName,
        HEALTH_GROUPING_ENABLED: `${healthGrouping?.enabled ?? false}`,
      },
    });

    for (const priority of Statics.monitoringPriorities) {
      const paramValue = StringParameter.valueForStringParameter(this, `${Statics.ssmSlackWebhookUrlPriorityPrefix}-${prefix}-${priority}`);
      lambda.addEnvironment(`SLACK_WEBHOOK_URL_${priority.toUpperCase()}`, paramValue);
    }

    return lambda;
  }

  private connectHealthQueue(
    healthEventLambda: HealthEventFunction,
    healthTimerLambda: HealthTimerFunction,
    timerQueue: Queue,
  ) {
    timerQueue.grantSendMessages(healthEventLambda);
    timerQueue.grantConsumeMessages(healthTimerLambda);
    healthTimerLambda.addEventSource(new SqsEventSource(timerQueue));
  }
}
