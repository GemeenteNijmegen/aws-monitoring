import { Environment } from 'aws-cdk-lib';
import { Priority, SpecificPriority, Statics } from './statics';

export type AccountType = 'acceptance' | 'production' | 'development' | 'test' | 'sandbox';

export interface DeploymentEnvironment {
  accountName: string;
  env: Environment;
  accountType: AccountType;

  /**
   * Indicates if monitoring is deployed to this account
   * @default true
   */
  monitor?: boolean;

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
  priority: Priority | SpecificPriority;
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
   * Configuration for monitoring a secret
   * Note roleMonitoring and keyMonitoring behave mutually exclusive
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

  /**
   * Configuration for monitoring deployments from local users
   */
  localDeployMonitoring?: {
    /**
     * The string contained in the assumedRoleUserArn
     * Example: 'deploy-role'
     */
    roleArnContains: string;
    /**
     * The string contained in the userIdentityArn
     * Example: 'AWSReservedSSO'
     */
    userIdentityArnContains: string;
  };
}

/**
 * List all environments for which which a monitoring
 * pipeline should be deployed in prod
 */
export const deploymentEnvironments: { [key: string]: Configuration } = {
  main: {
    branchName: 'main',
    environmentName: 'production',
    pipelineStackCdkName: 'aws-monitoring-prod',
    globalMonitoringRules: [
      {
        roleMonitoring: {
          roleName: 'lz-platform-operator-ep',
        },
        description: 'EP role used!',
        priority: {
          default: 'high',
          production: 'high',
          acceptance: 'medium',
          development: 'low',
          sandbox: 'low',
          test: 'low',
        },
      },
      {
        roleMonitoring: {
          roleName: 'landingzone-break-glass',
        },
        description: 'Break the glass role used!',
        priority: 'critical',
      },
      {
        localDeployMonitoring: {
          roleArnContains: 'deploy-role',
          userIdentityArnContains: 'AWSReservedSSO',
        },
        description: 'Local CDK Deployment',
        priority: {
          default: 'critical',
          production: 'critical',
          acceptance: 'high',
          development: 'low',
          sandbox: 'low',
          test: 'low',
        },
      },
      {
        roleMonitoring: {
          roleName: 'oblcc-admin',
        },
        description: 'Xebia admin role used!',
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
        accountName: 'gn-data-storage-production',
        accountType: 'production',
        env: {
          account: '549334216741',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-data-storage-acceptance',
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
            description: 'Yivi GetSecretValue called on private key! (acceptance)',
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
            description: 'Yivi GetSecretValue called on private key! (production)',
            priority: 'critical',
            secretMonitoring: {
              secretArn: 'arn:aws:secretsmanager:eu-central-1:079163754011:secret:/yivi-brp-issue/container/private-key-',
            },
          },
        ],
      },
      {
        accountName: 'gn-mijn-nijmegen-dev',
        accountType: 'development',
        env: {
          account: '590184009539',
          region: 'eu-central-1',
        },
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
        accountName: 'gn-static-websites-prod',
        accountType: 'production',
        env: {
          account: '654477686593',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-static-websites-accp',
        accountType: 'acceptance',
        env: {
          account: '991246619216',
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
        enableDevopsGuru: true,
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
      {
        accountName: 'gn-webform-submission-storage-dev',
        accountType: 'development',
        env: {
          account: '358927146986',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-webform-submission-storag-accp',
        accountType: 'acceptance',
        env: {
          account: '654654253219',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-webform-submission-storage-prod',
        accountType: 'production',
        env: {
          account: '606343885688',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-component-library-development',
        accountType: 'development',
        env: {
          account: '598242258242',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-component-library-accp',
        accountType: 'acceptance',
        env: {
          account: '768900902886',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-component-library-prod',
        accountType: 'production',
        env: {
          account: '706611162248',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-yivi-nijmegen-accp',
        accountType: 'acceptance',
        env: {
          account: '992382808833',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-yivi-nijmegen-prod',
        accountType: 'production',
        env: {
          account: '767398106682',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-sandbox-01',
        accountType: 'sandbox',
        monitor: false,
        env: {
          account: '833119272131',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-sandbox-marnix',
        accountType: 'sandbox',
        monitor: false,
        env: {
          account: '049753832279',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-sandbox-martijn',
        accountType: 'sandbox',
        monitor: false,
        env: {
          account: '471112523908',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-sandbox-michel',
        accountType: 'sandbox',
        monitor: false,
        env: {
          account: '011672839752',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-sandbox-wieteke',
        accountType: 'sandbox',
        monitor: false,
        env: {
          account: '584893782702',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-mpa',
        accountType: 'production',
        monitor: false,
        env: {
          account: '427617903428',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-audit',
        accountType: 'production',
        monitor: false,
        env: {
          account: '302838002127',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-network',
        accountType: 'production',
        monitor: false,
        env: {
          account: '043872078922',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-mijn-services-dev',
        accountType: 'development',
        monitor: true,
        env: {
          account: '958979025885',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-mijn-services-accp',
        accountType: 'acceptance',
        monitor: true,
        env: {
          account: '145023129433',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-mijn-services-prod',
        accountType: 'production',
        monitor: true,
        env: {
          account: '692859927138',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-open-forms-accp',
        accountType: 'acceptance',
        monitor: true,
        env: {
          account: '043309345347',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-open-forms-prod',
        accountType: 'production',
        monitor: true,
        env: {
          account: '761018864362',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-haal-centraal-brp-dev',
        accountType: 'development',
        monitor: true,
        env: {
          account: '084828568398',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-haal-centraal-brp-accp',
        accountType: 'acceptance',
        monitor: true,
        env: {
          account: '448049813413',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-haal-centraal-brp-prod',
        accountType: 'production',
        monitor: true,
        env: {
          account: '980921728594',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-sandbox-bram',
        accountType: 'sandbox',
        monitor: false,
        env: {
          account: '941377141741',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-sandbox-esper',
        accountType: 'sandbox',
        monitor: false,
        env: {
          account: '837644359001',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-sandbox-teppei',
        accountType: 'sandbox',
        monitor: false,
        env: {
          account: '770404292215',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-ai-accp',
        accountType: 'acceptance',
        monitor: true,
        env: {
          account: '528757829324',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-ai-prod',
        accountType: 'production',
        monitor: true,
        env: {
          account: '222634384969',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-4daagsefeesten-accp',
        accountType: 'acceptance',
        monitor: true,
        env: {
          account: '288761733826',
          region: 'eu-central-1',
        },
      },
      {
        accountName: 'gn-4daagsefeesten-prod',
        accountType: 'production',
        monitor: true,
        env: {
          account: '061039783330',
          region: 'eu-central-1',
        },
      },
    ],
  },
  sandbox: {
    branchName: 'sandbox',
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
          {
            localDeployMonitoring: {
              roleArnContains: 'deploy-role',
              userIdentityArnContains: 'AWSReservedSSO',
            },
            description: 'Local CDK Deployment',
            priority: 'critical',
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
