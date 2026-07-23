import { getConfiguration } from '../../DeploymentEnvironments';
import { Priority } from '../../statics';

const VALID_PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical'];

export function healthGroupingPriority(accounts: Array<string | undefined>): Priority {
  const configuredPriority = configuredHealthGroupingPriority();
  if (!['high', 'critical'].includes(configuredPriority)) {
    return configuredPriority;
  }

  const branchName = process.env.BRANCH_NAME ?? 'main';
  const configuration = getConfiguration(branchName);
  const knownAccounts = accounts.filter((account): account is string => !!account);
  const includesProductionAccount = knownAccounts.some(account => {
    const deployment = configuration.deployToEnvironments.find(deploymentEnv => deploymentEnv.env.account === account);
    return deployment?.accountType === 'production';
  });

  if (includesProductionAccount) {
    return configuredPriority;
  }

  const includesKnownNonProductionAccount = knownAccounts.some(account => {
    const deployment = configuration.deployToEnvironments.find(deploymentEnv => deploymentEnv.env.account === account);
    return !!deployment?.accountType && deployment.accountType !== 'production';
  });

  return includesKnownNonProductionAccount ? 'medium' : configuredPriority;
}

function configuredHealthGroupingPriority(): Priority {
  const configuredPriority = process.env.HEALTH_GROUPING_PRIORITY?.toLowerCase();
  if (configuredPriority && VALID_PRIORITIES.includes(configuredPriority as Priority)) {
    return configuredPriority as Priority;
  }

  return 'high';
}
