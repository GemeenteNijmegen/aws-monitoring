import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AssumedRoleAlarms } from './AssumedRoleAlarms';
import { DeploymentEnvironment } from './DeploymentEnvironments';
import { Statics } from './statics';

export interface MpaMonitoringStackProps extends StackProps {
  deployToEnvironments: DeploymentEnvironment[];
}

export class MpaMonitoringStack extends Stack {

  constructor(scope: Construct, id: string, props: MpaMonitoringStackProps) {
    super(scope, id, props);

    new AssumedRoleAlarms(this, 'alarms', {
      cloudTrailLogGroupName: Statics.orgTrailLogGroupName,
      roles: Statics.assumedRolesToAlarmOn,
    });
  }

}