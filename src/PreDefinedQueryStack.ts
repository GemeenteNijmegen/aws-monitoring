import * as fs from 'fs';
import * as path from 'path';
import { Stack, StackProps } from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';


export class PreDefinedQueryStack extends Stack {

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const dir = path.join(__dirname, 'Queries');
    const files = fs.readdirSync(dir);
    files.filter(file => file != '.' && file != '..').forEach(file => {
      const location = path.join(dir, file);
      const name = path.basename(file, 'cw');
      const query = fs.readFileSync(location).toString();

      new logs.QueryDefinition(this, name, {
        queryDefinitionName: name,
        queryString: query,
      });
    });


  }


}