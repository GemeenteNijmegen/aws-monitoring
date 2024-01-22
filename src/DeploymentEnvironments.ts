import { Environment } from 'aws-cdk-lib';
import { CloudWatchInsightsQueryProps } from './LogQueryJob/Query';
import { Priority, Statics } from './statics';

export interface DeploymentEnvironment {
  accountName: string;
  env: Environment;
  accountType: 'sandbox' | 'development' | 'test' | 'acceptance' | 'production';

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

  /**
   * Define key or role monitoring conditions on the OrgTrail
   * that apply to this specific account
   * @default none
   */
  monitoringRules?: MonitoringRule[];
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

  /**
   * Define key or role monitoring conditions on the OrgTrail
   * that apply to all accounts
   * @default none
   */
  globalMonitoringRules?: MonitoringRule[];
}

export interface Configurable {
  configuration: Configuration;
}

export interface MonitoringRule {
  /**
   * Priority of the alert
   */
  priority: Priority;
  /**
   * Add a description to the alert
   */
  description: string;

  /**
   * Configuration for monitoring a specific kms key
   *  Note keyMonitoring and roleMonitoring behave mutually exclusive.
   */
  keyMonitoring?: {
    /**
     * The ARN of the key to alert on
     * Note keyArn and ruleName behave mutually exclusive
     */
    keyArn: string;
    /**
     * Alert only on events included in here
     * E.g. 'GenerateDataKey', 'Encrypt', 'DescribeKey', 'GetKeyRotationStatus'
     */
    includeEvents?: string[];
    /**
     * Alert on all events except events included here
     * E.g. 'GenerateDataKey', 'Encrypt', 'DescribeKey', 'GetKeyRotationStatus'
     */
    excludeEvents?: string[];
  };

  /**
   * Configuration for monitoring a specific role
   *  Note roleM0nitoring and keyMonitoring behave mutually exclusive.
   */
  roleMonitoring?: {
    /**
     * The name of the role to alert on
     * Matching is based on the substring of the role ARN
     * e.g. arn.includes(roleName)
     */
    roleName: string;
  };

  /**
   * Configuratino for monitoring a secret
   * Note roleM0nitoring and keyMonitoring behave mutually exclusive
   */
  secretMonitoring?: {
    /**
     * The ARN of the secret to alart on
     * Note: prefix matched (ie. the last 8 random charcters can be left out)
     */
    secretArn: string;
    /**
     * Alert only on events included in here
     */
    includeEvents?: string[];
    /**
     * Alert on all events except events included here
     */
    excludeEvents?: string[];
  };
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
    globalMonitoringRules: [
      {
        roleMonitoring: {
          roleName: 'lz-platform-operator-ep',
        },
        description: 'EP role used!',
        priority: 'critical',
      },
      {
        roleMonitoring: {
          roleName: 'landingzone-break-glass',
        },
        description: 'Break the glass role used!',
        priority: 'critical',
      },
    ],
    deployToEnvironments: [
      {
        accountName: 'gn-build',
        accountType: 'production',
        env: {
          account: Statics.gnBuildAccount,
          region: 'eu-central-1',
        },
        enableDevopsGuru: true,
      },
      {
        accountName: 'gn-geo-data-production',
        accountType: 'production',
        env: {
          account: '549334216741',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-geo-data-acceptance',
        accountType: 'acceptance',
        env: {
          account: '766983128454',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-yivi-accp',
        accountType: 'acceptance',
        env: {
          account: '699363516011',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-yivi-prod',
        accountType: 'production',
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
        accountType: 'acceptance',
        env: {
          account: '528030426040',
          region: 'eu-central-1',
        },
        monitoringRules: [
          {
            description: 'Role to manage yivi secrets assumed! (acceptance)',
            priority: 'medium',
            roleMonitoring: {
              roleName: 'yivi-admin',
            },
          },
          {
            description: 'Yivi KMS key used! (acceptance)',
            priority: 'medium',
            secretMonitoring: {
              secretArn: 'arn:aws:secretsmanager:eu-central-1:528030426040:secret:/yivi-brp-issue/container/private-key-',
            },
          },
        ],
      },
      {
        accountName: 'gn-yivi-brp-issue-prod',
        accountType: 'production',
        enableDevopsGuru: true,
        env: {
          account: '079163754011',
          region: 'eu-central-1',
        },
        monitoringRules: [
          {
            description: 'Role to manage yivi secrets assumed! (production)',
            priority: 'critical',
            roleMonitoring: {
              roleName: 'yivi-admin',
            },
          },
          {
            description: 'Yivi KMS key used! (production)',
            priority: 'critical',
            secretMonitoring: {
              secretArn: 'arn:aws:secretsmanager:eu-central-1:079163754011:secret:/yivi-brp-issue/container/private-key-',
            },
          },
        ],
      },
      {
        accountName: 'gn-mijn-nijmegen-accp',
        accountType: 'acceptance',
        env: {
          account: '021929636313',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-mijn-nijmegen-prod',
        accountType: 'production',
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
      {
        accountName: 'gn-webforms-dev',
        accountType: 'development',
        env: {
          account: '033598396027',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-webforms-accp',
        accountType: 'acceptance',
        env: {
          account: '338472043295',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-webforms-prod',
        accountType: 'production',
        enableDevopsGuru: true,
        env: {
          account: '147064197580',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-static-websites',
        accountType: 'production',
        env: {
          account: '654477686593',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-verwerkingenlogging-accp',
        accountType: 'acceptance',
        env: {
          account: '649781704230',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-verwerkingenlogging-prod',
        accountType: 'production',
        enableDevopsGuru: false, // No workload yet, enable later
        env: {
          account: '887474129159',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-sociale-recherche-accp',
        accountType: 'acceptance',
        enableDevopsGuru: false,
        env: {
          account: '543802458112',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-sociale-recherche-prod',
        accountType: 'production',
        enableDevopsGuru: false, // No workload yet, enable later
        env: {
          account: '958875843009',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-tribebrplinker-development',
        accountType: 'development',
        env: {
          account: '471236387053',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-tribebrplinker-acceptance',
        accountType: 'acceptance',
        env: {
          account: '987304085258',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-tribebrplinker-production',
        accountType: 'production',
        enableDevopsGuru: true,
        env: {
          account: '962664892091',
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
        accountType: 'development',
        env: Statics.sandboxEnvironment,
        enableDevopsGuru: true,
        monitoringRules: [
          {
            roleMonitoring: {
              roleName: 'lz-platform-operator-ep',
            },
            description: 'EP role used!',
            priority: 'critical',
          },
        ],
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
