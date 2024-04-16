import { PermissionsBoundaryAspect } from '@gemeentenijmegen/aws-constructs';
import { Aspects, Stack, Stage, StageProps, Tags } from 'aws-cdk-lib';
import { EventPattern } from 'aws-cdk-lib/aws-events';
import { Role } from 'aws-cdk-lib/aws-iam';
import { DeploymentType, StackSet, StackSetTarget, StackSetTemplate } from 'cdk-stacksets';
import { Construct } from 'constructs';
import { AggregatorStack } from './AggregatorStack';
import { DeploymentEnvironment } from './DeploymentEnvironments';
import { EventbridgeForwarderStack } from './EventbridgeForwarderStack';
import { IntegrationsStack } from './IntegrationsStack';
import { MonitoredAccountStack } from './MonitoredAccountStack';
import { ParameterStack } from './ParameterStack';
import { Priority, Statics } from './statics';

export interface MonitoringTargetStageProps extends StageProps {
  deployToEnvironments: DeploymentEnvironment[];
  isProduction?: boolean;
  branchName: string;
}

export interface EventSubscriptionConfiguration {
  id: string;
  criticality: Priority;
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
    Aspects.of(this).add(new PermissionsBoundaryAspect());

    const stack = new Stack(this, 'eventbridgeforwarder');
    const eventbridgeForwarderStack = new EventbridgeForwarderStack(stack, 'eventbridge-forwarder', { targetRegion: 'eu-central-1' });
    new StackSet(stack, 'StackSet', {
      target: StackSetTarget.fromAccounts({
        regions: ['us-east-1', 'eu-west-1'],
        accounts: props.deployToEnvironments.map(environment => environment.env.account).filter(account => account) as string[],
      }),
      deploymentType: DeploymentType.selfManaged({
        adminRole: Role.fromRoleName(stack, 'cdkrole', 'cdk-hnb659fds-cfn-exec-role-836443378780-eu-central-1'),
      }),
      template: StackSetTemplate.fromStackSetStack(eventbridgeForwarderStack),
    });

    props.deployToEnvironments.forEach(environment => {
      new MonitoredAccountStack(this, `${environment.accountName}`, environment);
    });

    const parameterPrefix = props.isProduction ? 'prod' : 'dev';
    const parameterStack = new ParameterStack(this, 'parameters', {
      env: Statics.aggregatorEnvironment,
      prefix: parameterPrefix,
    });
    new AggregatorStack(this, 'aggregator', {
      env: Statics.aggregatorEnvironment,
      prefix: parameterPrefix,
      branchName: props.branchName,
    }).addDependency(parameterStack);

    new IntegrationsStack(this, 'integrations', {
      env: Statics.aggregatorEnvironment,
      prefix: parameterPrefix,
    }).addDependency(parameterStack);

  }
}
