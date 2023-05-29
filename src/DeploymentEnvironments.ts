import { Environment } from 'aws-cdk-lib';
import { Statics } from './statics';

export interface DeploymentEnvironment {
  accountName: string;
  env: Environment;

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
 * Note: separate monitoring resources are deployed to the MPA account
 */
export const deploymentEnvironments: DeploymentEnvironment[] = [
  {
    accountName: 'gn-build',
    env: {
      account: Statics.gnBuildAccount,
      region: 'eu-central-1',
    },
  },
  {
    accountName: 'gn-geo-data-production',
    env: {
      account: '549334216741',
      region: 'eu-central-1',
    },
  },
];
