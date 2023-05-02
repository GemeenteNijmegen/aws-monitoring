import { Stack, StackProps, Stage, StageProps, Tags } from 'aws-cdk-lib';
import { EventPattern } from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';
import { DefaultAlarms } from './DefaultAlarms';
import { DeploymentEnvironment } from './DeploymentEnvironments';
import { EventSubscription } from './EventSubscription';
import { Statics } from './statics';
import { MonitoringFunction } from './monitoringLambda/monitoring-function';
import { ITopic, Topic } from 'aws-cdk-lib/aws-sns';
import { LambdaSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

export interface MonitoringTargetStageProps extends StageProps {
  deployToEnvironments: DeploymentEnvironment[];
}

interface EventSubscriptionConfiguration {
  id: string;
  criticality: 'low' | 'medium' | 'high' | 'critical';
  pattern: EventPattern;
  ruleDescription: string;
}

export class MonitoringTargetStage extends Stage {
  /**
   * The monitoring target stage creates a stack containing
   * eventbridge rules and several default alarms for monitoring
   * an account. Notifications get posted to one of several SNS
   * topics. This project assumes those topics already exist in
   * the account, and their arn's are saved to SSM, with parameter
   * names of the format `/landingzone/platform-events/${criticality}-sns-topic-arn`
   */
  constructor(scope: Construct, id: string, props: MonitoringTargetStageProps) {
    super(scope, id, props);
    Tags.of(this).add('cdkManaged', 'yes');
    Tags.of(this).add('Project', Statics.projectName);

    props.deployToEnvironments.forEach(environment => {
      new MonitoredAccountStack(this, `${environment.accountName}`, environment);
    });

    // TODO: Roll out lambda to audit-account
    new AggregatorStack(this, 'aggregator', { env: { 
      account: Statics.gnAggregatorAccount,
      region: 'eu-central-1'
    }})
    // TODO: Roll out cloudtrail-stuff to mpa-account?
  }
}

export class AggregatorStack extends Stack {
  /**
   * A stack deployed to the audit account. SNS notifications
   * from all monitored accounts are forwarded to this account,
   * which has a matching set of SNS topics.
   * 
   * We subscribe to these topics from our monitoring messaging
   * lambda.
   */
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    const lambda = new MonitoringFunction(this, 'slack-lambda');
    
    //TODO: Start listening to all criticality levels
    const topic = this.topic('low');
    topic.addSubscription(new LambdaSubscription(lambda));
  }

  private topic(criticality: string): ITopic {
    const arn = StringParameter.valueForStringParameter(this,
      `/landingzone/platform-events/central-${criticality}-sns-topic-arn`);
    return Topic.fromTopicArn(this, 'topic', arn);
  }
}

export class MonitoredAccountStack extends Stack {
  /**
   * Create a new stack containing all resources required for monitoring
   * this specfic (target) account.
   */
  constructor(scope: Construct, id: string, props: DeploymentEnvironment) {
    super(scope, id, props);

    Tags.of(this).add('cdkManaged', 'yes');
    Tags.of(this).add('Project', Statics.projectName);

    this.addEventSubscriptions(props);
    new DefaultAlarms(this, 'default-alarms');
  }

  /**
   * Add Eventbridge rules and send notifications to SNS for triggered events.
   *
   * Used for alarm notifications (all in account/region) and ECS task state
   * changes (all in region). */
  private addEventSubscriptions(props: DeploymentEnvironment) {
    const eventSubscriptions: EventSubscriptionConfiguration[] = [
      {
        id: 'alarms',
        criticality: 'low',
        pattern: {
          source: ['aws.cloudwatch'],
          detailType: ['CloudWatch Alarm State Change'],
        },
        ruleDescription: 'Send all alarm state change notifications to SNS',
      },
      {
        id: 'ecs-state-change',
        criticality: 'low',
        pattern: {
          source: ['aws.ecs'],
          detailType: ['ECS Task State Change'],
        },
        ruleDescription: 'Send all ECS state change notifications to SNS',
      },
      {
        id: 'certificates',
        criticality: 'medium',
        pattern: {
          source: ['aws.acm'],
          detailType: ['ACM Certificate Approaching Expiration'],
        },
        ruleDescription: 'Send certificate expiration notifications to SNS',
      },
      {
        id: 'devopsguru-events',
        criticality: 'high',
        pattern: {
          source: ['aws.devops-guru'],
          detailType: ['DevOps Guru New Insight Open'],
        },
        ruleDescription: 'Devopsguru New insights + increased severity to SNS',
      },
      {
        id: 'codepipeline-events',
        criticality: 'low',
        pattern: {
          source: ['aws.codepipeline'],
          detailType: ['CodePipeline Pipeline Execution State Change'],
          detail: {
            state: ['STARTED', 'FAILED', 'STOPPED', 'SUCCEEDED', 'SUPERSEDED'],
          },
        },
        ruleDescription: 'Send codepipeline state change to SNS',
      },
      {
        id: 'health-events',
        criticality: 'medium',
        pattern: {
          source: ['aws.health'],
          detailType: ['AWS Health Event'],
        },
        ruleDescription: 'Send Health Dashboard alerts to SNS',
      },
      {
        id: 'inspector-finding-events',
        criticality: 'critical',
        pattern: {
          source: ['aws.inspector2'],
          detailType: ['Inspector2 Finding'],
          detail: {
            severity: ['CRITICAL'],
          },
        },
        ruleDescription: 'Send Inspector2 Finding notifications to SNS',
      },
      {
        id: 'ec2-start-events',
        criticality: 'low',
        pattern: {
          source: ['aws.ec2'],
          detailType: ['EC2 Instance State-change Notification'],
          detail: {
            state: ['pending', 'running', 'stopped', 'stopping', 'terminated'],
          },
        },
        ruleDescription: 'Send EC2 instance events to SNS',
      },
      {
        id: 'cloudformation-stack-drift-events',
        criticality: 'low',
        pattern: {
          source: ['aws.cloudformation'],
          detailType: ['CloudFormation Drift Detection Status Change'],
          detail: {
            'status-details': {
              'stack-drift-status': ['DRIFTED'],
              'detection-status': ['DETECTION_COMPLETE'],
            },
          },
        },
        ruleDescription: 'Send stack drift detected events to SNS',
      },
    ];

    const includeFilter = (sub: { id: string }) => {
      return props.includedEventSubscriptions ? props.includedEventSubscriptions.includes(sub.id) : true;
    };
    const excludeFilter = (sub: { id: string }) => {
      return props.excludedEventSubscriptions ? !props.excludedEventSubscriptions.includes(sub.id) : true;
    };

    eventSubscriptions
      .filter(includeFilter)
      .filter(excludeFilter)
      .forEach(subscription =>
        new EventSubscription(this, subscription.id, { ...subscription }),
      );
  }
}
