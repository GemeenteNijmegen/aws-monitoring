import { App } from 'aws-cdk-lib';
import { deploymentEnvironments } from './DeploymentEnvironments';
import { PipelineStack } from './PipelineStack';

// for development, use sandbox account
const deployFromEnvironment = {
  account: '418648875085',
  region: 'eu-west-1',
};

const sandboxEnvironment = {
  account: '122467643252',
  region: 'eu-west-1',
};

const app = new App();

if ('BRANCH_NAME' in process.env == false || process.env.BRANCH_NAME == 'development') {
  new PipelineStack(app, 'aws-monitoring-pipeline-development',
    {
      env: deployFromEnvironment,
      branchName: 'development',
      deployToEnvironments: [{ accountName: 'sandbox', env: sandboxEnvironment, assumedRolesToAlarmOn: 'Developers' }],
      environmentName: 'sandbox',
    },
  );
} else if ( process.env.BRANCH_NAME == 'main') {
  new PipelineStack(app, 'aws-monitoring-pipeline-prod',
    {
      env: deployFromEnvironment,
      branchName: 'main',
      deployToEnvironments: deploymentEnvironments,
      environmentName: 'production',
    },
  );
}

app.synth();