export type Attempt = {
  id: string;
  kind: string;
  state: string;
  connection_id: string;
  test_output_usable: boolean | null;
};
export type OperationalEvent = {
  id: string;
  title: string;
  state: string;
  revision: number;
  originalAllowance: number;
  additionalPrints: number;
  confirmedPrints: number;
  captures: number;
  allowanceReserved: number;
  stockReserved: number;
  eventUnresolved: number;
  attemptsPage: number;
  hasOlderAttempts: boolean;
  usableTestConnectionIds: string[];
  onHand: number;
  runState: string | null;
  connectionId: string | null;
  attempts: Attempt[];
  redacted: boolean;
  mediaRemovalState: string;
};
