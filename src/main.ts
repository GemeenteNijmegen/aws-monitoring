import { App } from 'aws-cdk-lib';
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
if ('BRANCH_NAME' in process.env == false || process.env.BRANCH_NAME == 'development') {
	new PipelineStack(app, 'aws-monitoring-pipeline-development',
		{
			env: deploymentEnvironment,
			branchName: 'development',
			deployToEnvironment: sandboxEnvironment,
			environmentName: 'sandbox'
		},
	);
}


const deploymentEnvironments = [
	{ 
		name: 'auth-accp',
		env: {
			account: '315037222840',
			region: 'eu-west-1',
		}
	}
]

if ('BRANCH_NAME' in process.env == false || process.env.BRANCH_NAME == 'main') {
	new PipelineStack(app, 'aws-monitoring-pipeline-development',
		{
			env: deploymentEnvironment,
			branchName: 'development',
			deployToEnvironment: sandboxEnvironment,
			environmentName: 'sandbox'
		},
	);
} else if ( process.env.BRANCH_NAME == 'main') {
	deploymentEnvironments.forEach(environment => {
		new PipelineStack(app, `aws-monitoring-pipeline-${environment.name}`,
		{
			env: deploymentEnvironment,
			branchName: 'main',
			deployToEnvironment: environment.env,
			environmentName: environment.name
		},
	);
	})
}

app.synth();