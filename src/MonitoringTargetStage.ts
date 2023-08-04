import { PermissionsBoundaryAspect } from '@gemeentenijmegen/aws-constructs';
import { Aspects, Stage, StageProps, Tags } from 'aws-cdk-lib';
import { EventPattern } from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';
import { AggregatorStack } from './AggregatorStack';
import { DeploymentEnvironment } from './DeploymentEnvironments';
import { IntegrationsStack } from './IntegrationsStack';
import { MonitoredAccountStack } from './MonitoredAccountStack';
import { ParameterStack } from './ParameterStack';
import { Statics } from './statics';

export interface MonitoringTargetStageProps extends StageProps {
  deployToEnvironments: DeploymentEnvironment[];
  isProduction?: boolean;
}

export interface EventSubscriptionConfiguration {
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

    Aspects.of(this).add(new PermissionsBoundaryAspect());

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
    }).addDependency(parameterStack);

    new IntegrationsStack(this, 'integrations', {
      env: Statics.aggregatorEnvironment,
      prefix: parameterPrefix,
    }).addDependency(parameterStack);

  }
}
