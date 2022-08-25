import { Environment } from 'aws-cdk-lib';

export interface DeploymentEnvironment {
  accountName: string;
  env: Environment;
  assumedRolesToAlarmOn?: string|string[];
}
