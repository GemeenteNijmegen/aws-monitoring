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
  {
    accountName: 'gn-geo-data-acceptance',
    env: {
      account: '766983128454',
      region: 'eu-central-1',
    },
  },
  {
    accountName: 'gn-yivi-accp',
    env: {
      account: '699363516011',
      region: 'eu-central-1',
    },
  },
  {
    accountName: 'gn-yivi-prod',
    env: {
      account: '185512167111',
      region: 'eu-central-1',
    },
  },
  {
    accountName: 'gn-yivi-brp-issue-accp',
    env: {
      account: '528030426040',
      region: 'eu-central-1',
    },
  },
  {
    accountName: 'gn-yivi-brp-issue-prod',
    env: {
      account: '079163754011',
      region: 'eu-central-1',
    },
  },
  {
    accountName: 'gn-mijn-nijmegen-accp',
    env: {
      account: '021929636313',
      region: 'eu-central-1',
    },
  },
  {
    accountName: 'gn-mijn-nijmegen-prod',
    env: {
      account: '740606269759',
      region: 'eu-central-1',
    },
  },
];
