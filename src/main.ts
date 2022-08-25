import { App } from 'aws-cdk-lib';
import { DeploymentEnvironment } from './DeploymentEnvironment';
import { PipelineStack } from './PipelineStack';

// for development, use sandbox account
const deploymentEnvironment = {
  account: '418648875085',
  region: 'eu-west-1',
};

const sandboxEnvironment = {
  account: '122467643252',
  region: 'eu-west-1',
};

// const acceptanceEnvironment = {
// 	account: '315037222840',
// 	region: 'eu-west-1',
// };

// const productionEnvironment = {
// 	account: '196212984627',
// 	region: 'eu-west-1',
// };

const app = new App();


/**
 * List all environments for which which a monitoring
 * pipeline should be deployed in prod
 */
const deploymentEnvironments: DeploymentEnvironment[] = [
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
];

if ('BRANCH_NAME' in process.env == false || process.env.BRANCH_NAME == 'development') {
  new PipelineStack(app, 'aws-monitoring-pipeline-development',
    {
      env: deploymentEnvironment,
      branchName: 'development',
      deployToEnvironments: [{ accountName: 'sandbox', env: sandboxEnvironment, assumedRolesToAlarmOn: 'Developers' }],
      environmentName: 'sandbox',
    },
  );
} else if ( process.env.BRANCH_NAME == 'main') {
  new PipelineStack(app, 'aws-monitoring-pipeline-prod',
    {
      env: deploymentEnvironment,
      branchName: 'main',
      deployToEnvironments: deploymentEnvironments,
      environmentName: 'production',
    },
  );
}

app.synth();