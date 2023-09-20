import { Stack, StackProps, Stage, StageProps } from 'aws-cdk-lib';
import { Configurable } from './DeploymentEnvironments';
import { OrgTrailMonitoring } from './OrgTrailMonitoring';
import { Statics } from './statics';

export interface MpaMonitoringStageProps extends StageProps, Configurable {}

export class MpaMonitoringStage extends Stage {
  constructor(scope: any, id: string, props: MpaMonitoringStageProps) {
    super(scope, id, props);
    new MpaMonitoringStack(this, 'stack', {
      env: props.env,
      configuration: props.configuration,
    });
  }
}

export interface MpaMonitoringStackProps extends StackProps, Configurable {}

export class MpaMonitoringStack extends Stack {
  constructor(scope: any, id: string, props: MpaMonitoringStackProps) {
    super(scope, id, props);
    new OrgTrailMonitoring(this, 'orgtrail', {
      cloudTrailLogGroupName: Statics.orgTrailLogGroupName,
      configurationBranchName: props.configuration.branchName,
      environmentName: props.configuration.environmentName,
    });
  }
}