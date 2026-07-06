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