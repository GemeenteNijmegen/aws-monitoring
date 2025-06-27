import { Stack, Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DefaultAlarms } from './DefaultAlarms';
import { DeploymentEnvironment } from './DeploymentEnvironments';
import { DevopsGuruMonitoring } from './DevopsGuruMonitoring';
import { EventSubscription } from './EventSubscription';
import { LogQueryAccessRole } from './LogQueryAccessRole';
import { EventSubscriptionConfiguration } from './MonitoringTargetStage';
import { Statics } from './statics';


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

    /**
     * If the account needs to be queried by the log query job (eg. props.queryDefinitons is defined)
     * setup a role to be assumed by the (centralized) log query lambda.
     */
    if (props.queryDefinitions) {
      new LogQueryAccessRole(this, 'logqueryrole', {
        queryDefinitions: props.queryDefinitions,
      });
    }

    if (props.enableDevopsGuru) {
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
        id: 'ecs-state-change',
        criticality: 'low',
        pattern: {
          source: ['aws.ecs'],
          detailType: ['ECS Task State Change'],
        },
        ruleDescription: 'Send all ECS state change notifications to SNS',
      },
      // Temporarily check this to figure out failing health checks in ECS
      // https://github.com/aws-samples/amazon-ecs-agent-connection-monitoring
      // https://github.com/aws-samples/amazon-ecs-agent-connection-monitoring/blob/main/ecs-agent-monitoring.yaml
      {
        id: 'ecs-container-agent-disconnect',
        criticality: 'low',
        pattern: {
          source: ['aws.ecs'],
          detail: {
            agentConnected: [false],
            status: 'ACTIVE',
          },
        },
        ruleDescription: 'Send ECS container disconnect notices to SNS',
      },
      {
        id: 'ec2-spot-instance-interruption',
        criticality: 'low',
        pattern: {
          source: ['aws.ec2'],
          detailType: ['EC2 Spot Instance Interruption Warning'],
        },
        ruleDescription: 'Send all EC2 Spot Instance interruptions to SNS',
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
      {
        id: 'alarms-default',
        criticality: 'low',
        pattern: {
          source: ['aws.cloudwatch'],
          detailType: ['CloudWatch Alarm State Change'],
          detail: {
            alarmName: [{ 'anything-but': { suffix: '-lvl' } }],
            state: {
              value: ['ALARM'],
            },
          },
        },
        ruleDescription: 'Send all alarms to SNS by default',
      },
      {
        id: 'alarms-low',
        criticality: 'low',
        pattern: {
          source: ['aws.cloudwatch'],
          detailType: ['CloudWatch Alarm State Change'],
          detail: {
            alarmName: [{ suffix: '-low-lvl' }],
            state: {
              value: ['ALARM'],
            },
          },
        },
        ruleDescription: 'Send all low alarms to SNS',
      },
      {
        id: 'alarms-medium',
        criticality: 'medium',
        pattern: {
          source: ['aws.cloudwatch'],
          detailType: ['CloudWatch Alarm State Change'],
          detail: {
            alarmName: [{ suffix: '-medium-lvl' }],
            state: {
              value: ['ALARM'],
            },
          },
        },
        ruleDescription: 'Send all medium alarms to SNS',
      },
      {
        id: 'alarms-high',
        criticality: 'high',
        pattern: {
          source: ['aws.cloudwatch'],
          detailType: ['CloudWatch Alarm State Change'],
          detail: {
            alarmName: [{ suffix: '-high-lvl' }],
            state: {
              value: ['ALARM'],
            },
          },
        },
        ruleDescription: 'Send all high alarms to SNS',
      },
      {
        id: 'alarms-critical',
        criticality: 'critical',
        pattern: {
          source: ['aws.cloudwatch'],
          detailType: ['CloudWatch Alarm State Change'],
          detail: {
            alarmName: [{ suffix: '-critical-lvl' }],
            state: {
              value: ['ALARM'],
            },
          },
        },
        ruleDescription: 'Send all critical alarms to SNS',
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
