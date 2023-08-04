import { Stack, Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DefaultAlarms } from './DefaultAlarms';
import { DeploymentEnvironment } from './DeploymentEnvironments';
import { EventSubscription } from './EventSubscription';
import { EventSubscriptionConfiguration } from './MonitoringTargetStage';
import { Statics } from './statics';
import { DevopsGuruMonitoring } from './DevopsGuruNotifications';


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

    if(props.enableDevopsGuru){
      new DevopsGuruMonitoring(this, 'devopsguru');
    }

  }

  /**
   * Add Eventbridge rules and send notifications to SNS for triggered events.
   *
   * Used for alarm notifications (all in account/region) and ECS task state
   * changes (all in region). */
  private addEventSubscriptions(props: DeploymentEnvironment) {
    const eventSubscriptions: EventSubscriptionConfiguration[] = [
      {
        id: 'alarm-reset',
        criticality: 'low',
        pattern: {
          source: ['aws.cloudwatch'],
          detailType: ['CloudWatch Alarm State Change'],
          detail: {
            state: {
              value: ['INSUFFICIENT_DATA', 'OK'],
            },
            previousState: {
              value: ['ALARM'],
            },
          },
        },
        ruleDescription: 'Send alarm state change notifications from alarm to OK to SNS',
      },
      {
        id: 'alarm',
        criticality: 'high',
        pattern: {
          source: ['aws.cloudwatch'],
          detailType: ['CloudWatch Alarm State Change'],
          detail: {
            state: {
              value: ['ALARM'],
            },
          },
        },
        ruleDescription: 'Send all alarm state change notifications to ALARM to SNS',
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
            severity: ['CRITICAL', 'HIGH'],
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
      .forEach(subscription => new EventSubscription(this, subscription.id, { ...subscription }),
      );
  }
}
