import { Environment } from 'aws-cdk-lib';

export interface DeploymentEnvironment {
  accountName: string;
  env: Environment;
  assumedRolesToAlarmOn?: string|string[];

  /**
   * If set, only event subscriptions matching ids in this array
   * will be included in the account. No other rules will be added.
   */
  includedEventSubscriptions?: string[];
  /**
   * if set, event subscriptions matching ids in this array
   * will be excluded from the default list in the account.
   */
  excludedEventSubscriptions?: string[];

  /**
   *
   */
  enableDevopsGuru?: boolean;
}

/**
 * List all environments for which which a monitoring
 * pipeline should be deployed in prod
 */
export const deploymentEnvironments: DeploymentEnvironment[] = [
  {
    accountName: 'gn-geo-data-production',
    env: {
      account: '549334216741',
      region: 'eu-central-1',
    },
  },
];
