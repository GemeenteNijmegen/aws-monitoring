import { Priority } from '../statics';

export interface OrgTrailMonitorConfiguration {
  accountId: string;
  accountName: string;
  kmsKeysToMonitor?: KeyMonitorConfiguration[];
  rolesToMonitor?: RoleMonitorConfiguration[];
}

export interface KeyMonitorConfiguration {
  /**
   * Priority of the alert
   */
  priority: Priority;
  /**
   * Add a description to the alert
   */
  description: string;
  /**
   * The ARN of the key to alert on
   */
  keyArn: string;
}

export interface RoleMonitorConfiguration {
  /**
   * Priority of the alert
   */
  priority: Priority;

  /**
   * Add a description to the alert
   */
  description: string;

  /**
   * The name of the role to alert on
   * Matching is based on the suffix of the role ARN
   * e.g. arn.endsWith(roleName)
   */
  roleName: string;

  /**
   * Not implemented yet
   * Idea: do not alert if certain principals use the role (e.g. business users)
   */
  ignorePrincipals?: string[];
}

export const monitoringConfiguration: OrgTrailMonitorConfiguration[] = [
  {
    accountId: '528030426040',
    accountName: 'gn-yivi-brp-issue-accp',
    rolesToMonitor: [
      {
        roleName: 'yivi-admin',
        priority: 'high',
        description: 'The Yivi credentials management role is used! (on acceptance)',
      },
    ],
  },
  {
    accountId: '079163754011',
    accountName: 'gn-yivi-brp-issue-prod',
    rolesToMonitor: [
      {
        roleName: 'yivi-admin',
        priority: 'critical',
        description: 'The Yivi credentials management role is used in production!',
      },
    ],
  },
];