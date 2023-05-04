import { PermissionsBoundaryAspect } from '@gemeentenijmegen/aws-constructs';
import { Stack, StackProps, Tags, pipelines, CfnParameter, Aspects } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DeploymentEnvironment } from './DeploymentEnvironments';
import { MonitoringTargetStage } from './MonitoringTargetStage';
import { Statics } from './statics';

export interface PipelineStackProps extends StackProps{
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

    Tags.of(this).add('cdkManaged', 'yes');
    Tags.of(this).add('Project', Statics.projectName);
    this.branchName = props.branchName;
    this.environmentName = props.environmentName;

    const connectionArn = new CfnParameter(this, 'connectionArn');
    const source = this.connectionSource(connectionArn);

    const pipeline = this.pipeline(source);
    pipeline.addStage(new MonitoringTargetStage(this, `monitoring-${this.environmentName}`, 
    { 
      deployToEnvironments: props.deployToEnvironments,
      isProduction: props.isProduction
    }));
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
