"use client";
import { useState } from "react";

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
  const [showField, setShowField] = useState(false);

  if (modeOfPayment !== "Cash") {
    if (showField) setShowField(false);
    return null;
  }

  if (!showField) setShowField(true);

  const label =
    transactionType === "CashIn"
      ? "Cash Received By"
      : "Cash Paid By";

  const placeholder =
    transactionType === "CashIn"
      ? "Enter name of person receiving cash"
      : "Enter name of person who made the payment";

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} <span className="text-red-500">*</span>
      </label>
      <input
        type="text"
        value={cashPersonName}
        onChange={(e) => {
          setCashPersonName(e.target.value);
          if (setError) setError("cashPersonName", "");
        }}
        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          error ? "border-red-500" : "border-gray-300"
        }`}
        placeholder={placeholder}
      />
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
}