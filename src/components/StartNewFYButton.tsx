"use client";
import { useState } from "react";
import { db } from "../firebase/config";
import { ref, get, set } from "firebase/database";
import { DB_PATHS, YEAR_KEY_REGEX, dbPath } from "../utils/constants";
import { useFinancialYear } from "../context/FinancialYearContext";
import { useAuth } from "../context/AuthContext";
import { logAudit } from "../utils/auditLog";

interface ConfirmModalProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

function ConfirmModal({ message, onConfirm, onCancel, loading }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Confirm Action</h3>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Confirm & Start"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StartNewFYButton() {
  const { user } = useAuth();
  const { selectedYear, setSelectedYear, availableYears, setAvailableYears } = useFinancialYear();
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Determine the next financial year
  const maxYear = availableYears.length > 0
    ? Math.max(...availableYears.map(y => parseInt(y)))
    : parseInt(selectedYear);
  const nextYear = (maxYear + 1).toString();

  const handleStartNewFY = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      // Get the previous year's members (i.e., the latest available year)
      const prevYear = maxYear.toString();
      const membersRef = ref(db, dbPath.members(prevYear));
      const membersSnapshot = await get(membersRef);

      if (!membersSnapshot.exists()) {
        throw new Error(`No members found in financial year ${prevYear} to copy.`);
      }

      const membersData = membersSnapshot.val();
      const newMembersRef = ref(db, dbPath.members(nextYear));
      const newMembers: Record<string, any> = {};

      // Copy members, resetting payment status
      Object.keys(membersData).forEach((memberKey) => {
        const member = membersData[memberKey];
        newMembers[memberKey] = {
          ...member,
          paymentStatus: false,
          // Remove any income/payment related fields that should be reset
          receiptNo: "",
          receiptDate: "",
          paidAmount: 0,
          paymentDate: "",
          transactionId: "",
          paymentMode: "",
          chequeNo: "",
          incomeKey: null,
          paymentAmount: 0,
        };
      });

      // Write all members to the new financial year
      await set(newMembersRef, newMembers);

      // Audit log
      if (user) {
        await logAudit({
          action: "CREATE",
          entityType: "Member",
          entityId: `FY_${nextYear}`,
          previousData: null,
          newData: { copiedFromYear: prevYear, memberCount: Object.keys(newMembers).length },
          changedBy: user.email || "unknown",
          changedByUid: user.uid,
          changedAt: new Date().toISOString(),
        });
      }

      // Refresh available years
      const rootSnapshot = await get(ref(db, DB_PATHS.ROOT));
      if (rootSnapshot.exists()) {
        const data = rootSnapshot.val();
        const years = Object.keys(data)
          .filter(key => YEAR_KEY_REGEX.test(key))
          .sort((a, b) => parseInt(b) - parseInt(a));
        setAvailableYears(years);
      }

      // Switch to the new year
      setSelectedYear(nextYear);
      setSuccess(`Financial year ${nextYear} created successfully with ${Object.keys(newMembers).length} members copied from ${prevYear}.`);
      setShowConfirm(false);
    } catch (err: any) {
      setError(err.message || "An error occurred while creating the new financial year.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        disabled={loading}
        className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg shadow-md hover:from-emerald-600 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all duration-200 px-4 py-2 text-sm font-medium disabled:opacity-50"
        title={`Start new financial year ${nextYear}`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
        Start New FY ({nextYear})
      </button>

      {showConfirm && (
        <ConfirmModal
          message={`This will create a new financial year node for ${nextYear} in the database and copy all members from ${maxYear} (setting payment status to false for all). This action cannot be undone. Are you sure you want to proceed?`}
          onConfirm={handleStartNewFY}
          onCancel={() => setShowConfirm(false)}
          loading={loading}
        />
      )}

      {/* Success/Error Toast */}
      {(success || error) && (
        <div className="fixed bottom-4 right-4 z-50 animate-fade-in">
          <div className={`rounded-lg shadow-lg p-4 max-w-md ${success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="flex items-start gap-3">
              {success ? (
                <svg className="w-5 h-5 text-green-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <p className={`text-sm ${success ? 'text-green-800' : 'text-red-800'}`}>
                {success || error}
              </p>
              <button
                onClick={() => { setSuccess(null); setError(null); }}
                className="ml-auto shrink-0"
              >
                <svg className="w-4 h-4 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}