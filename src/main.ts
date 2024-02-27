import { App } from 'aws-cdk-lib';
import { getConfiguration } from './DeploymentEnvironments';
import { PipelineStack } from './PipelineStack';
import { Statics } from './statics';

const deployFromEnvironment = {
  account: Statics.gnBuildAccount,
  region: 'eu-central-1',
};

const app = new App();

const branchToBuild = process.env.BRANCH_NAME ?? 'sandbox';
console.log(`Branch to build: ${branchToBuild}`);
const configuration = getConfiguration(branchToBuild);

new PipelineStack(app, configuration.pipelineStackCdkName, {
  env: deployFromEnvironment,
  branchName: configuration.branchName,
  deployToEnvironments: configuration.deployToEnvironments,
  environmentName: configuration.environmentName,
  isProduction: configuration.environmentName == 'production',
  configuration: configuration,
});

app.synth();
