import { ACCOUNT_CREATED } from '../../contracts/events/account-events';
export const publish = (name: string, payload: unknown) => [name, payload, ACCOUNT_CREATED];
