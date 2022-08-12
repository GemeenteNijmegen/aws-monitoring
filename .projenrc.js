const { GemeenteNijmegenCdkApp } = require('@gemeentenijmegen/modules-projen');
const project = new GemeenteNijmegenCdkApp({
  cdkVersion: '2.1.0',
  defaultReleaseBranch: 'main',
  devDeps: [
    '@gemeentenijmegen/modules-projen',
  ],
  name: 'aws-monitoring',

  deps: [
    'aws-cdk-lib',
    'constructs',
    'cdk-nag',
  ],
  scripts: {
    'post-upgrade': 'cd src/LogLambda &&  npx npm-check-updates --upgrade --target=minor',
  },
  /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // packageName: undefined,  /* The "name" in package.json. */
});
project.synth();