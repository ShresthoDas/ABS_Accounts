"use client";
import { useEffect, useState } from "react";
import { get, ref } from "firebase/database";
import { db } from "../firebase/config";
import { useFinancialYear } from "../context/FinancialYearContext";
import { dbPath } from "../utils/constants";

interface CashPersonFieldProps {
  modeOfPayment: string;
  transactionType: "CashIn" | "CashOut";
  cashPersonName: string;
  setCashPersonName: (value: string) => void;
  error?: string;
  setError?: (field: string, value: string) => void;
}

export default function CashPersonField({
  modeOfPayment,
  transactionType,
  cashPersonName,
  setCashPersonName,
  error,
  setError,
}: CashPersonFieldProps) {
  const { selectedYear } = useFinancialYear();
  const [memberNames, setMemberNames] = useState<string[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (modeOfPayment !== "Cash") return;

    let isCurrent = true;
    setMembersLoading(true);
    setMembersError("");

    get(ref(db, dbPath.members(selectedYear)))
      .then((snapshot) => {
        if (!isCurrent) return;

        if (!snapshot.exists()) {
          setMemberNames([]);
          return;
        }

        const members = snapshot.val() as Record<string, { name?: unknown }>;
        const names = Object.values(members)
          .map((member) => (typeof member?.name === "string" ? member.name.trim() : ""))
          .filter(Boolean);
        setMemberNames(Array.from(new Set(names)).sort((a, b) => a.localeCompare(b)));
      })
      .catch((loadError: unknown) => {
        console.error("Error loading member names for cash-person suggestions:", loadError);
        if (isCurrent) {
          setMembersError("Could not load member names. You can still enter a name.");
        }
      })
      .finally(() => {
        if (isCurrent) setMembersLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [modeOfPayment, selectedYear]);

  if (modeOfPayment !== "Cash") return null;

  const label =
    transactionType === "CashIn"
      ? "Cash Received By"
      : "Cash Paid By";

  const placeholder =
    transactionType === "CashIn"
      ? "Enter name of person receiving cash"
      : "Enter name of person who made the payment";

  const matchingNames = cashPersonName.trim()
    ? memberNames
        .filter((name) => name.toLowerCase().includes(cashPersonName.trim().toLowerCase()))
        .slice(0, 8)
    : [];

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} <span className="text-red-500">*</span>
      </label>
      <input
        type="text"
        value={cashPersonName}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onChange={(e) => {
          setCashPersonName(e.target.value);
          if (setError) setError("cashPersonName", "");
        }}
        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          error ? "border-red-500" : "border-gray-300"
        }`}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isFocused && matchingNames.length > 0}
        aria-controls="cash-person-member-suggestions"
      />
      {isFocused && matchingNames.length > 0 && (
        <ul
          id="cash-person-member-suggestions"
          role="listbox"
          className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-gray-300 bg-white py-1 shadow-lg"
        >
          {matchingNames.map((name) => (
            <li key={name} role="option" aria-selected="false">
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setCashPersonName(name);
                  setIsFocused(false);
                  if (setError) setError("cashPersonName", "");
                }}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50"
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {isFocused && !membersLoading && !membersError && cashPersonName.trim() && matchingNames.length === 0 && (
        <p className="mt-1 text-sm text-gray-500">No member match. You can enter a new name.</p>
      )}
      {membersLoading && <p className="mt-1 text-sm text-gray-500">Loading member names...</p>}
      {membersError && <p className="mt-1 text-sm text-amber-700">{membersError}</p>}
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
}
