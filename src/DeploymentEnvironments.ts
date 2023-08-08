import { Environment } from 'aws-cdk-lib';
import { CloudWatchInsightsQueryProps } from './LogQueryJob/Query';
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
   * Flag to enable DevOps guru (AWS service)
   */
  enableDevopsGuru?: boolean;

  /**
   * Query definitions that will run during the
   * scheduled log query job.
   * Note: the lambda assumes the log-query-job-role present in the gn-audit account.
   * To incldue a query here gant that role permissions to the corresponding log groups.
   * @default none
   */
  queryDefinitons?: CloudWatchInsightsQueryProps[];
}

export interface Configuration {
  /**
   * The branch name to build
   */
  branchName: string;

  /**
   * The name of the environment to deploy to
   */
  environmentName: 'development' | 'production';

  /**
   * The list of environments to deploy to
   */
  deployToEnvironments: DeploymentEnvironment[];

  /**
   * The CDK id for the pipeline stack (in main.ts)
   */
  pipelineStackCdkName: string;
}

/**
 * List all environments for which which a monitoring
 * pipeline should be deployed in prod
 */
export const deploymentEnvironments: { [key: string]: Configuration } = {
  'main-new-lz': {
    branchName: 'main-new-lz',
    environmentName: 'production',
    pipelineStackCdkName: 'aws-monitoring-prod',
    deployToEnvironments: [
      {
        accountName: 'gn-build',
        env: {
          account: Statics.gnBuildAccount,
          region: 'eu-central-1',
        },
        enableDevopsGuru: true,
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
        queryDefinitons: [
          {
            name: 'errors-in-yivi-issue-app',
            description: 'Errors in yivi-issue-app',
            region: 'eu-central-1',
            queryString: '\
            fields @timestamp, @message \
            | sort @timestamp desc\
            | limit 10',
            logGroupNames: [
              '/aws/lambda/yivi-issue-api-api-stack-yiviissueloginfunctionlam-M4LZu8YoWQHL',
              '/aws/lambda/yivi-issue-api-api-stack-yiviissuelogoutfunctionla-fIeoeLcB5aZG',
              '/aws/lambda/yivi-issue-api-api-stack-yiviissueauthfunctionlamb-cO8UwjkYQQu9',
              '/aws/lambda/yivi-issue-api-api-stack-yiviissueissuefunctionlam-BskPkOS1v9B9',
            ],
          },
        ],
      },
      {
        accountName: 'gn-yivi-prod',
        enableDevopsGuru: true,
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
        enableDevopsGuru: true,
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
        enableDevopsGuru: true,
        env: {
          account: '740606269759',
          region: 'eu-central-1',
        },
      },
    ],
  },
  'sandbox-new-lz': {
    branchName: 'sandbox-new-lz',
    environmentName: 'development',
    pipelineStackCdkName: 'aws-monitoring-sandbox',
    deployToEnvironments: [
      {
        accountName: 'workload-test',
        env: Statics.sandboxEnvironment,
        enableDevopsGuru: true,
      },
    ],
  },
};

export function getConfiguration(branchName: string): Configuration {
  const config = deploymentEnvironments[branchName];
  if (!config) {
    throw new Error(`No configuration found for branch ${branchName}`);
  }
  return config;
}
