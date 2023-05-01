const { GemeenteNijmegenCdkApp } = require('@gemeentenijmegen/modules-projen');
const project = new GemeenteNijmegenCdkApp({
  cdkVersion: '2.1.0',
  defaultReleaseBranch: 'main',
  name: 'aws-monitoring',
  depsUpgradeOptions: {
    workflowOptions: {
      branches: ['development'],
    },
  },
  deps: [
    '@gemeentenijmegen/aws-constructs',
    'aws-cdk-lib',
    'constructs',
    'cdk-nag',
    'axios',
    '@types/aws-lambda',
  ],
  devDeps: [
    '@gemeentenijmegen/modules-projen',
    'axios-mock-adapter',
  ],
  /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // packageName: undefined,  /* The "name" in package.json. */
});
project.synth();