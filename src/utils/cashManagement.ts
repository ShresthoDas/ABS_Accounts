"use client";
import { db } from "../firebase/config";
import { ref, push, set, get, update, child } from "firebase/database";
import { dbPath, CASH_TRANSACTION_TYPES } from "./constants";

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

export interface CashTransactionData {
  key?: string | null;
  date: string;
  amount: number;
  transactionType: "CashIn" | "CashOut";
  cashPersonName: string;
  sourceEntity: string;
  sourceEntityKey: string;
  sourceReference: string;
  inputBy: string;
  createdAt: string;
  createdBy?: string;
  description?: string;
}

export interface CashTransferData {
  key?: string | null;
  date: string;
  amount: number;
  fromPerson: string;
  toPerson: string;
  inputBy: string;
  createdBy?: string;
  createdAt: string;
  description?: string | null;
}

/**
 * Records a cash transaction and updates the cash till balance for the given person.
 * For CashIn: increases the person's till balance.
 * For CashOut: decreases the person's till balance.
 */
export async function recordCashTransaction(
  data: CashTransactionData,
  selectedYear: string
): Promise<void> {
  // Create the transaction record
  const transactionsRef = ref(db, dbPath.cashTransactions(selectedYear));
  const newTransactionRef = push(transactionsRef);
  const transactionKey = newTransactionRef.key;

  const transactionRecord = {
    ...data,
    key: transactionKey,
    createdAt: new Date().toISOString(),
  };

  await set(newTransactionRef, transactionRecord);

  // Update the cash till balance for this person
  const cashTillRef = ref(db, dbPath.cashTill(selectedYear));
  const tillSnapshot = await get(child(cashTillRef, data.cashPersonName));

  const currentBalance = tillSnapshot.exists() ? tillSnapshot.val().balance || 0 : 0;
  let newBalance = currentBalance;

  if (data.transactionType === CASH_TRANSACTION_TYPES.CASH_IN) {
    newBalance = roundMoney(currentBalance + data.amount);
  } else {
    newBalance = roundMoney(currentBalance - data.amount);
  }

  await update(child(cashTillRef, data.cashPersonName), {
    name: data.cashPersonName,
    balance: newBalance,
    lastUpdated: new Date().toISOString(),
  });
}

/**
 * Reverses a previous cash transaction (used when editing/deleting records).
 * For reversing CashIn: subtracts the amount from the person's till.
 * For reversing CashOut: adds the amount back to the person's till.
 */
export async function reverseCashTransaction(
  transactionKey: string,
  cashPersonName: string,
  transactionType: "CashIn" | "CashOut",
  amount: number,
  selectedYear: string
): Promise<void> {
  // Update the cash till balance for this person
  const cashTillRef = ref(db, dbPath.cashTill(selectedYear));
  const tillSnapshot = await get(child(cashTillRef, cashPersonName));

  const currentBalance = tillSnapshot.exists() ? tillSnapshot.val().balance || 0 : 0;
  let newBalance = currentBalance;

  // Reverse: if it was CashIn, we need to subtract; if CashOut, we need to add back
  if (transactionType === CASH_TRANSACTION_TYPES.CASH_IN) {
    newBalance = roundMoney(currentBalance - amount);
  } else {
    newBalance = roundMoney(currentBalance + amount);
  }

  await update(child(cashTillRef, cashPersonName), {
    name: cashPersonName,
    balance: newBalance,
    lastUpdated: new Date().toISOString(),
  });
}

/**
 * Records a cash transfer between two users.
 * Deducts amount from fromPerson's till and adds to toPerson's till.
 * Also records CashOut for sender and CashIn for receiver in CashTransactions
 * so all cash movement appears in the Cash Management Report.
 */
export async function recordCashTransfer(
  data: CashTransferData,
  selectedYear: string
): Promise<void> {
  // Create the transfer record
  const transfersRef = ref(db, dbPath.cashTransfers(selectedYear));
  const newTransferRef = push(transfersRef);
  const transferKey = newTransferRef.key;

  const transferRecord = {
    ...data,
    key: transferKey,
    createdAt: new Date().toISOString(),
  };

  await set(newTransferRef, transferRecord);

  // Update the cash till balance for the sender (deduct)
  const cashTillRef = ref(db, dbPath.cashTill(selectedYear));
  const now = new Date().toISOString();
  const transferRefDesc = `Cash Transfer to ${data.toPerson}`;
  const transferToDesc = `Cash Transfer from ${data.fromPerson}`;

  // Update sender's till (deduct) and record CashOut transaction
  const senderTillSnapshot = await get(child(cashTillRef, data.fromPerson));
  const senderBalance = senderTillSnapshot.exists() ? senderTillSnapshot.val().balance || 0 : 0;
  const newSenderBalance = roundMoney(senderBalance - data.amount);

  await update(child(cashTillRef, data.fromPerson), {
    name: data.fromPerson,
    balance: newSenderBalance,
    lastUpdated: now,
  });

  // Record CashOut transaction for sender (so it appears in Cash Report)
  const senderTxRef = push(ref(db, dbPath.cashTransactions(selectedYear)));
  await set(senderTxRef, {
    key: senderTxRef.key,
    date: data.date,
    amount: data.amount,
    transactionType: CASH_TRANSACTION_TYPES.CASH_OUT,
    cashPersonName: data.fromPerson,
    sourceEntity: "Cash Transfer",
    sourceEntityKey: transferKey,
    sourceReference: transferRefDesc,
    inputBy: data.inputBy,
    createdBy: data.createdBy,
    createdAt: now,
    description: data.description || transferRefDesc,
  });

  // Update receiver's till (add) and record CashIn transaction
  const receiverTillSnapshot = await get(child(cashTillRef, data.toPerson));
  const receiverBalance = receiverTillSnapshot.exists() ? receiverTillSnapshot.val().balance || 0 : 0;
  const newReceiverBalance = roundMoney(receiverBalance + data.amount);

  await update(child(cashTillRef, data.toPerson), {
    name: data.toPerson,
    balance: newReceiverBalance,
    lastUpdated: now,
  });

  // Record CashIn transaction for receiver (so it appears in Cash Report)
  const receiverTxRef = push(ref(db, dbPath.cashTransactions(selectedYear)));
  await set(receiverTxRef, {
    key: receiverTxRef.key,
    date: data.date,
    amount: data.amount,
    transactionType: CASH_TRANSACTION_TYPES.CASH_IN,
    cashPersonName: data.toPerson,
    sourceEntity: "Cash Transfer",
    sourceEntityKey: transferKey,
    sourceReference: transferToDesc,
    inputBy: data.inputBy,
    createdBy: data.createdBy,
    createdAt: now,
    description: data.description || transferToDesc,
  });
}
