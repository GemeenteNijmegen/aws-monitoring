import { App } from 'aws-cdk-lib';
import { deploymentEnvironments } from './DeploymentEnvironments';
import { PipelineStack } from './PipelineStack';
import { Statics } from './statics';

// for development, use sandbox account
const deployFromEnvironment = {
  account: Statics.gnBuildAccount,
  region: 'eu-central-1',
};

const sandboxEnvironment = {
  account: '122467643252',
  region: 'eu-central-1',
};

const app = new App();

if ('BRANCH_NAME' in process.env == false || process.env.BRANCH_NAME == 'sandbox-new-lz') {
  new PipelineStack(app, 'aws-monitoring-sandbox',
    {
      env: deployFromEnvironment,
      branchName: 'sandbox-new-lz',
      deployToEnvironments: [{ accountName: 'sandbox', env: sandboxEnvironment, assumedRolesToAlarmOn: 'Developers' }],
      environmentName: 'sandbox',
    },
  );
} else if ( process.env.BRANCH_NAME == 'main-new-lz') {
  new PipelineStack(app, 'aws-monitoring-prod',
    {
      env: deployFromEnvironment,
      branchName: 'main-new-lz',
      deployToEnvironments: deploymentEnvironments,
      environmentName: 'production',
    },
  );
}

app.synth();