import { Stack, StackProps, Tags, pipelines, CfnParameter } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DeploymentEnvironment } from './DeploymentEnvironments';
import { MonitoringTargetStage } from './MonitoringTargetStage';
import { Statics } from './statics';

export interface PipelineStackProps extends StackProps{
  branchName: string;
  deployToEnvironments: DeploymentEnvironment[];
  environmentName: string;
}

export class PipelineStack extends Stack {
  branchName: string;
  environmentName: string;
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);
    Tags.of(this).add('cdkManaged', 'yes');
    Tags.of(this).add('Project', Statics.projectName);
    this.branchName = props.branchName;
    this.environmentName = props.environmentName;

    const connectionArn = new CfnParameter(this, 'connectionArn');
    const source = this.connectionSource(connectionArn);

    const pipeline = this.pipeline(source);
    pipeline.addStage(new MonitoringTargetStage(this, 'monitoring-stack', { deployToEnvironments: props.deployToEnvironments }));
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

    const pipeline = new pipelines.CodePipeline(this, `monitoring-${this.environmentName}`, {
      pipelineName: `monitoring-${this.environmentName}`,
      dockerEnabledForSelfMutation: true,
      dockerEnabledForSynth: true,
      crossAccountKeys: true,
      synth: synthStep,
    });
    return pipeline;
  }

  private connectionSource(connectionArn: CfnParameter): pipelines.CodePipelineSource {
    return pipelines.CodePipelineSource.connection('GemeenteNijmegen/aws-monitoring', this.branchName, {
      connectionArn: connectionArn.valueAsString,
    });
  }
}