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