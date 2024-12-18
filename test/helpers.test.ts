import { arrayHasDuplicatesByKeys } from '../src/helpers';

test('Duplicates in search keys returns truenpx j', async() => {
  const arr = [
    { someKey: 'value1', someOtherKey: 'value2', irrelevantKey: 'value3' },
    { someKey: 'value1', someOtherKey: 'value2', irrelevantKey: 'value4' },
    { someKey: 'value5', someOtherKey: 'value6' },
  ];

  const keys = ['someKey', 'someOtherKey'];

  const arr2 = [
    { someKey: { no: 'string' }, someOtherKey: 'value3', irrelevantKey: 'value4' },
    { someKey: { no: 'string' }, someOtherKey: 'value6' },
  ];

  const keys2 = ['someKey'];

  expect(arrayHasDuplicatesByKeys(arr, keys)).toBeTruthy();
  expect(arrayHasDuplicatesByKeys(arr2, keys2)).toBeTruthy();
});

test('No duplicates in search keys returns false', async() => {
  const arr = [
    { someKey: 'value1', someOtherKey: 'value2', irrelevantKey: 'value3' },
    { someKey: 'value3', someOtherKey: 'value2', irrelevantKey: 'value4' },
    { someKey: 'value5', someOtherKey: 'value6' },
  ];

  const keys = ['someKey', 'someOtherKey'];
  expect(arrayHasDuplicatesByKeys(arr, keys)).toBeFalsy();
});


