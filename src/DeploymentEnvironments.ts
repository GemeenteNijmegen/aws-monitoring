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
}

/**
 * List all environments for which which a monitoring
 * pipeline should be deployed in prod
 */
export const deploymentEnvironments: DeploymentEnvironment[] = [
  {
    accountName: 'auth-accp',
    env: {
      account: '315037222840',
      region: 'eu-west-1',
    },
  },
  {
    accountName: 'auth-prod',
    env: {
      account: '196212984627',
      region: 'eu-west-1',
    },
  },
  {
    accountName: 'dns',
    env: {
      account: '108197740505',
      region: 'eu-west-1',
    },
    assumedRolesToAlarmOn: 'nijmegen-operator',
  },
  {
    accountName: 'production',
    env: {
      account: '799049117469',
      region: 'eu-west-1',
    },
  },
  {
    accountName: 'development',
    env: {
      account: '774916747470',
      region: 'eu-west-1',
    },
  },
  {
    accountName: 'deployment',
    env: {
      account: '418648875085',
      region: 'eu-west-1',
    },
    includedEventSubscriptions: [
      'codepipeline-events',
    ],
  },
  {
    accountName: 'generiek-accp',
    env: {
      account: '229631103712',
      region: 'eu-west-1',
    },
  },
  {
    accountName: 'generiek-prod',
    env: {
      account: '487749583954',
      region: 'eu-west-1',
    },
  },
];
