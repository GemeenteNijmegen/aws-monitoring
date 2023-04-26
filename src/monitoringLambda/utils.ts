/**
 * Get the env. var. account name.
 *
 * @returns {string} the account name, if not set throws an error.
 */
export function getAccount(): string {
  const account = process.env.ACCOUNT_NAME;
  if (!account) {
    throw Error('No account name defined in environment');
  }
  return account;
}

/**
 * Check if a string (case insensitive, regex allowed) is included in an array of strings.
 *
 * @param array an array of lowercased strings
 * @param string the string to match in the array
 * @returns boolean
 */

export function stringMatchesPatternInArray(array: string[], string: string): boolean {
  const lowerCasedString = string.toLowerCase();
  const match = array.find((potentialMatch) => {
    const regExp = new RegExp(potentialMatch.toLowerCase());
    return regExp.test(escapeRegExp(lowerCasedString));
  });
  return match !== undefined;
}
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}
