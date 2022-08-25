import { aws_kms, aws_sns, aws_ssm, RemovalPolicy, Stack, StackProps, Stage, StageProps, Tags } from 'aws-cdk-lib';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { LambdaSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { AssumedRoleAlarms } from './AssumedRoleAlarms';
import { DeploymentEnvironment } from './DeploymentEnvironment';
import { DevopsGuruNotifications } from './DevopsGuruNotifications';
import { EventSubscription } from './EventSubscription';
import { MonitoringLambda } from './MonitoringLambda';
import { Statics } from './statics';

export interface MonitoringTargetStageProps extends StageProps {
  deployToEnvironments: DeploymentEnvironment[];
}

export class MonitoringTargetStage extends Stage {
  /**
   * The monitoring target stage creates a stack containing
   * a monitoring topic, which can be used account-wide as a target
   * for monitoring notifications.
   */
  constructor(scope: Construct, id: string, props: MonitoringTargetStageProps) {
    super(scope, id, props);
    Tags.of(this).add('cdkManaged', 'yes');
    Tags.of(this).add('Project', Statics.projectName);

    props.deployToEnvironments.forEach(environment => {
      const paramsStack = new ParameterStack(this, `parameters-${environment.accountName}`, environment);
      const monitoringStack = new MonitoringTargetStack(this, `monitoring-${environment.accountName}`, environment);
      monitoringStack.addDependency(paramsStack, 'SSM Parameters must exist before lambda using it is created.');
    });
  }
}

export class MonitoringTargetStack extends Stack {
  /**
   * Create a new stack containing all resources required for the monitoring
   * stage.
   *
   * The monitoring topic has a lambda subscriber responsible for
   * formatting and sending relevant notifications to a slack channel.
   */
  constructor(scope: Construct, id: string, props: DeploymentEnvironment) {
    super(scope, id, props);

    Tags.of(this).add('cdkManaged', 'yes');
    Tags.of(this).add('Project', Statics.projectName);

    const key = this.kmskey();
    const topic = this.topic(key);

    this.addEventSubscriptions(topic);
    new DevopsGuruNotifications(this, 'devopsguru', { topic, topicKey: key });
    this.AddLambdaSubscriber(topic);

    if (props.assumedRolesToAlarmOn) {
      new AssumedRoleAlarms(this, 'assumed-roles', { cloudTrailLogGroupName: `gemeentenijmegen-${props.accountName}/cloudtrail`, roles: props.assumedRolesToAlarmOn });
    }

    this.suppressNagging();
  }


  /**
   * Add Eventbridge rules and send notifications to SNS for triggered events.
   *
   * Used for alarm notifications (all in account/region) and ECS task state
   * changes (all in region).
   *
   * @param {topic} topic the rule will send event notifications to this topic
   */
  private addEventSubscriptions(topic: aws_sns.Topic) {
    const eventSubscriptions = [
      {
        id: 'alarms',
        pattern: {
          source: ['aws.cloudwatch'],
          detailType: ['CloudWatch Alarm State Change'],
        },
        ruleDescription: 'Send all alarm state change notifications to SNS',
      },
      {
        id: 'ecs-state-change',
        pattern: {
          source: ['aws.ecs'],
          detailType: ['ECS Task State Change'],
        },
        ruleDescription: 'Send all ECS state change notifications to SNS',
      },
      {
        id: 'certificates',
        pattern: {
          source: ['aws.acm'],
          detailType: ['ACM Certificate Approaching Expiration'],
        },
        ruleDescription: 'Send certificate expiration notifications to SNS',
      },
    ];

    eventSubscriptions.forEach(subscription =>
      new EventSubscription(this, subscription.id, {
        topic, pattern: subscription.pattern, ruleDescription: subscription.ruleDescription,
      }),
    );
  }

  /**
   * Create a kms key for use with the SNS topic. Allow eventbridge to use this key
   */
  kmskey(): aws_kms.Key {
    const key = new aws_kms.Key(this, 'kmskey', {
      enableKeyRotation: true,
      description: 'encryption key for monitoring stack for this account',
      alias: 'account/kms/monitoring-key',
    });

    //Grant access to eventbridge for publishing to SNS
    key.grant(new ServicePrincipal('events.amazonaws.com'),
      'kms:Decrypt',
      'kms:Encrypt',
      'kms:ReEncrypt*',
      'kms:GenerateDataKey*',
    );

    new aws_ssm.StringParameter(this, 'key-arn', {
      stringValue: key.keyArn,
      parameterName: Statics.ssmMonitoringKeyArn,
    });

    return key;
  }

  /**
   * Create an SNS topic and a parameter exporting the topic arn.
   *
   * @returns aws_sns.Topic the newly created topic
   */
  topic(key: aws_kms.Key) {
    const topic = new aws_sns.Topic(this, 'sns-topic', {
      displayName: 'Account-wide monitoring topic',
      masterKey: key,
    });
    new aws_ssm.StringParameter(this, 'topic-arn', {
      stringValue: topic.topicArn,
      parameterName: Statics.ssmMonitoringTopicArn,
    });
    return topic;
  }

  /**
   * Creates a new lambda function and subscribes it to a topic.
   *
   * This lambda is responsible for formatting events posted to SNS
   * and sending notifications to a slack webhook.
   *
   * @param topic the SNS topic the lambda should be subscribed to
   */
  AddLambdaSubscriber(topic: aws_sns.Topic) {
    const monitoringLambda = new MonitoringLambda(this, 'log-lambda');
    topic.addSubscription(new LambdaSubscription(monitoringLambda.function));
  }

  private suppressNagging() {
    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Lambda needs to be able to create and write to a log group',
          appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
        },
      ],
      true,
    );

    /**
     * Deze is eigenlijk te breed, accepteert nu alle resources met wildcard in de stack. Voor zover ik kan vinden is
     * het niet specifieker in te richten. Ander nadeel van deze suppression is dat het op alle resources met wildcard
     * dit als metadata toevoegt.
     */
    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Setting a log retention policy requires wildcard resource permission for creating log groups.',
          appliesTo: ['Resource::*'],
        },
      ],
      true,
    );
  }
}

export class ParameterStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const slackParam = new aws_ssm.StringParameter(this, 'ssm_slack_1', {
      stringValue: '-',
      parameterName: Statics.ssmSlackWebhookUrl,
    });
    slackParam.applyRemovalPolicy(RemovalPolicy.DESTROY);
  }
}

