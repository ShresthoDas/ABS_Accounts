import { db } from "../firebase/config";
import { ref, push, set } from "firebase/database";
import {DB_PATHS} from "./constants";

export interface AuditEntry {
  action: "CREATE" | "UPDATE" | "DELETE";
  entityType: "Income" | "Expense" | "Member" | "Stall" | "Donation" | "Ad" | "SpotCollection" | "ProjectedIncome" | "ProjectedExpense" | "User" | "CashTransfer";
  entityId: string;
  previousData: Record<string, any> | null;
  newData: Record<string, any> | null;
  changedBy: string;
  changedByUid: string;
  changedAt: string;
}

export const logAudit = async (entry: AuditEntry) => {
  try {
    const currentYear = new Date().getFullYear().toString();
    const auditRef = push(ref(db, `${DB_PATHS.ROOT}/${currentYear}/AuditLog`));
    await set(auditRef, {
      ...entry,
      auditId: auditRef.key,
      timestamp: new Date().toISOString(),
    });
    console.log(`Audit log created: ${entry.action} ${entry.entityType} - ${entry.entityId}`);
  } catch (error) {
    console.error("Error creating audit log:", error);
  }
};