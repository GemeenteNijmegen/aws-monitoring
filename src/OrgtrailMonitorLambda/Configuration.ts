
export interface OrgTrailMonitorConfiguration {
  accountId: string;
  accountName: string;
  kmsKeysToMonitor?: string[];
  rolesToMonitor?: string[];
}

export const monitoringConfiguration: OrgTrailMonitorConfiguration[] = [
  {
    accountId: '549334216741',
    accountName: 'gn-geo-data-production',
    rolesToMonitor: ['lz-platform-operator'],
  },
];