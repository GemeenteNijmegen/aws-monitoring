/**
 * Check if a string (case insensitive, regex allowed) is included in an array of strings.
 *
 * @param array an array of lowercased strings
 * @param string the string to match in the array
 * @returns boolean
 */

export function stringMatchesPatternInArray(array: string[], string: string): boolean {
  console.debug(string);
  return typeof stringMatchingPatternInArray(array, string) == 'string';
}

/**
 * Check if a string (case insensitive, regex allowed) is included in an array of strings, and return the matching string.
 *
 * @param array an array of lowercased strings
 * @param string the string to match in the array
 * @returns the matching string, or false if not found
 */
export function stringMatchingPatternInArray(array: string[], string: string): string|false {
  console.debug(string);
  const lowerCasedString = string.toLowerCase();
  const match = array.find((potentialMatch) => {
    const regExp = new RegExp(potentialMatch.toLowerCase());
    return regExp.test(escapeRegExp(lowerCasedString));
  });
  return match !== undefined ? match : false;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}
