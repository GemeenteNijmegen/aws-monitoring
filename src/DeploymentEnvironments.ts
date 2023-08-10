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
  queryDefinitions?: CloudWatchInsightsQueryProps[];
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
      },
      {
        accountName: 'gn-yivi-prod',
        enableDevopsGuru: true,
        env: {
          account: '185512167111',
          region: 'eu-central-1',
        },
        queryDefinitions: [
          {
            name: 'yivi-prod-waf-blocked-requests',
            description: 'Yivi issue app prod blocked WAF requests',
            region: 'us-east-1',
            queryString: '\
            fields @timestamp, @message\
            | filter action = \'BLOCK\'\
            | sort @timestamp asc',
            logGroupNames: [
              'aws-waf-logs-yivi-issue-app',
            ],
          },
          {
            name: 'yivi-prod-errors',
            description: 'Yivi issue app prod errors',
            region: 'eu-central-1',
            queryString: '\
            fields @timestamp, @message\
            | filter @message like /ERROR/ or @message like /Error/\
            | sort @timestamp asc',
            logGroupNames: [
              '/aws/lambda/yivi-issue-api-api-stack-yiviissuelogoutfunctionla-FxyZ5ytUObuW',
              '/aws/lambda/yivi-issue-api-api-stack-yiviissueloginfunctionlam-0nhR0wS5nEgc',
              '/aws/lambda/yivi-issue-api-api-stack-yiviissueissuefunctionlam-SWufqEL4S6q2',
              '/aws/lambda/yivi-issue-api-api-stack-yiviissueauthfunctionlamb-6eYjqeNtt78W',
            ],
          },
        ],
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
        queryDefinitions: [
          {
            name: 'mijn-nijmegen-prod-waf-blocked-requests',
            description: 'Mijn Nijmegen prod blocked WAF requests',
            region: 'us-east-1',
            queryString: '\
            fields @timestamp, @message\
            | filter action = \'BLOCK\'\
            | sort @timestamp asc',
            logGroupNames: [
              'aws-waf-logs-mijn-nijmegen',
            ],
          },
          {
            name: 'mijn-nijmegen-prod-errors',
            description: 'Mijn Nijmegen prod errors',
            region: 'eu-central-1',
            queryString: '\
            fields @timestamp, @message\
            | filter @message like /ERROR/ or @message like /Error/\
            | sort @timestamp asc',
            logGroupNames: [
              '/aws/lambda/mijn-api-api-stack-authfunctionlambdaCE7349A6-ZOfMTx9LLk7w',
              '/aws/lambda/mijn-api-api-stack-homefunctionlambdaC6763389-M1Mv58DtxZZC',
              '/aws/lambda/mijn-api-api-stack-loginfunctionlambdaD9D22737-Gpk6wqGrrq78',
              '/aws/lambda/mijn-api-api-stack-logoutfunctionlambda0D09F767-Y5VhsuioUmBk',
              '/aws/lambda/mijn-gegevens-api-persoon-persoonsgegevensfunction-xjIqWmKd829e',
              '/aws/lambda/mijn-uitkering-api-uitker-uitkeringenfunctionlambd-uvevaHFvtp0z',
            ],
          },
        ],
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
        queryDefinitions: [
          {
            name: 'random-log-group-query',
            description: 'Some random testing query',
            region: 'eu-central-1',
            queryString: '\
            fields @timestamp, @message \
            | sort @timestamp desc\
            | limit 8',
            logGroupNames: [
              'test-log-group',
            ],
          },
          {
            name: 'random-log-group-query-us-east-1',
            description: 'Some random testing query',
            region: 'us-east-1',
            queryString: '\
            fields @timestamp, @message \
            | sort @timestamp asc\
            | limit 10',
            logGroupNames: [
              'test-log-group',
            ],
          },
        ],
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
