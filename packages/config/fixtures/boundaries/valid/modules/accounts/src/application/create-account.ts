import type { Account } from '../domain/account';
import { ACCOUNT_CREATED } from '../../../../packages/contracts/events/account-events';
import { publish } from '../../../../packages/kernel/src/bus';
export const createAccount = (account: Account) => publish(ACCOUNT_CREATED, account);
