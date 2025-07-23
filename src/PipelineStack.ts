import { PermissionsBoundaryAspect } from '@gemeentenijmegen/aws-constructs';
import { Aspects, CfnParameter, Stack, StackProps, Tags, pipelines } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AccountSetupStage } from './AccountSetupStage';
import { Configurable, DeploymentEnvironment } from './DeploymentEnvironments';
import { arrayHasDuplicatesByKeys } from './helpers';
import { MonitoringTargetStage } from './MonitoringTargetStage';
import { MpaMonitoringStage } from './MpaMonitoringStack';
import { Statics } from './statics';

export interface PipelineStackProps extends StackProps, Configurable {
  branchName: string;
  deployToEnvironments: DeploymentEnvironment[];
  environmentName: string;
  isProduction?: boolean;
}

export class PipelineStack extends Stack {
  branchName: string;
  environmentName: string;
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);
    Aspects.of(this).add(new PermissionsBoundaryAspect());

    console.debug('building pipeline');
    Tags.of(this).add('cdkManaged', 'yes');
    Tags.of(this).add('Project', Statics.projectName);
    this.branchName = props.branchName;
    this.environmentName = props.environmentName;

    const connectionArn = new CfnParameter(this, 'connectionArn');
    const source = this.connectionSource(connectionArn);

    const pipeline = this.pipeline(source);

    // Check config for duplicate accounts
    if (arrayHasDuplicatesByKeys(props.deployToEnvironments.map(env => env.env), ['account', 'region'])) {
      throw Error('Duplicate deployToEnvironments found, this will lead to build errors.');
    }

    const monitoring = new MonitoringTargetStage(this, `monitoring-${this.environmentName}`, {
      deployToEnvironments: props.deployToEnvironments,
      isProduction: props.isProduction,
      branchName: props.branchName,
    });
    pipeline.addStage(monitoring);

    /**
     * This stage sets account settings that we want to apply to all accounts.
     * E.g. Disable ssm document sharing (SecurityHub AFBS SSM.7 rule).
     */
    const accountSetup = new AccountSetupStage(this, `account-setup-${this.environmentName}`, {
      deployToEnvironments: props.deployToEnvironments,
    });
    pipeline.addStage(accountSetup);

    /**
     * We kunnen maar 2 log subscriptions hebben op de orgtrail log groep.
     * Een van deze posities wordt gevuld door de landingzone orgtrail monitoring lambda (van Xebia).
     * De ander wordt gevuld door dit project. Daarom deployen we dit alleen in productie en niet
     * development.
     */
    if (props.isProduction) {
      const mpaMonitoring = new MpaMonitoringStage(this, `mpa-monitoring-${this.environmentName}`, {
        env: Statics.mpaEnvironment,
        configuration: props.configuration,
      });
      pipeline.addStage(mpaMonitoring);
    }
  }

  pipeline(source: pipelines.CodePipelineSource): pipelines.CodePipeline {
    const synthStep = new pipelines.ShellStep('Synth', {
      input: source,
      env: {
        BRANCH_NAME: this.branchName,
      },
      commands: [
        'yarn install --frozen-lockfile',
        'npx projen build',
        'npx projen synth',
      ],
    });

    const pipeline = new pipelines.CodePipeline(this, `pipeline-${this.environmentName}`, {
      pipelineName: `monitoring-${this.environmentName}`,
      crossAccountKeys: true,
      synth: synthStep,
    });
    return pipeline;
  }

  private connectionSource(connectionArn: CfnParameter): pipelines.CodePipelineSource {
    return pipelines.CodePipelineSource.connection(`${Statics.repositoryOwner}/${Statics.repository}`, this.branchName, {
      connectionArn: connectionArn.valueAsString,
    });
  }
}
