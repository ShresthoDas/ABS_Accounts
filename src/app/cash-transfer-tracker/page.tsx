"use client";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../utils/getUserDoc";
import { useRouter } from "next/navigation";
import { db } from "../../firebase/config";
import { ref, get, child } from "firebase/database";
import { dbPath, ROUTES, hasAccess } from "../../utils/constants";
import { useFinancialYear } from "../../context/FinancialYearContext";
import { recordCashTransfer } from "../../utils/cashManagement";
import { logAudit } from "../../utils/auditLog";

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

export default function CashTransferTrackerPage() {
  const { user } = useAuth();
  const { selectedYear } = useFinancialYear();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const router = useRouter();

  // Form state
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [fromPerson, setFromPerson] = useState("");
  const [toPerson, setToPerson] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  // Available persons from cash till
  const [availablePersons, setAvailablePersons] = useState<string[]>([]);

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid)
        .then((data) => setUserData(data))
        .finally(() => setLoading(false));
    }
  }, [user]);

  useEffect(() => {
    if (userData && selectedYear) {
      fetchCashPersons();
    }
  }, [userData, selectedYear]);

  const fetchCashPersons = async () => {
    try {
      const cashTillRef = ref(db, dbPath.cashTill(selectedYear));
      const tillSnapshot = await get(cashTillRef);
      if (tillSnapshot.exists()) {
        const persons = Object.keys(tillSnapshot.val()).sort();
        setAvailablePersons(persons);
      }
    } catch (error) {
      console.error("Error fetching cash persons:", error);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!date) newErrors.date = "Date is required";
    if (!fromPerson) newErrors.fromPerson = "Please select the sender";
    if (!toPerson) newErrors.toPerson = "Please select the receiver";
    if (fromPerson && toPerson && fromPerson === toPerson) {
      newErrors.toPerson = "Sender and receiver cannot be the same person";
    }
    const transferAmount = roundMoney(parseFloat(amount) || 0);
    if (transferAmount <= 0) {
      newErrors.amount = "Amount must be greater than 0";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData || !user) return;
    if (!validateForm()) return;

    const transferAmount = roundMoney(parseFloat(amount) || 0);

    try {
      setSaving(true);

      const transferData = {
        date,
        amount: transferAmount,
        fromPerson: fromPerson.trim(),
        toPerson: toPerson.trim(),
        inputBy: userData.name || user.email || "Unknown",
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
        description: description.trim() || null,
      };

      await recordCashTransfer(transferData, selectedYear);

      await logAudit({
        action: "CREATE",
        entityType: "CashTransfer",
        entityId: "N/A",
        previousData: null,
        newData: transferData,
        changedBy: userData.name || user.email || "Unknown",
        changedByUid: user.uid,
        changedAt: new Date().toISOString(),
      });

      alert(`Cash transfer of ₹ ${transferAmount.toLocaleString('en-IN')} from ${fromPerson} to ${toPerson} recorded successfully!`);
      
      // Reset form
      setDate(new Date().toISOString().split("T")[0]);
      setFromPerson("");
      setToPerson("");
      setAmount("");
      setDescription("");
    } catch (error) {
      console.error("Error recording cash transfer:", error);
      alert("Error recording cash transfer. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const canAccess = userData && hasAccess(userData.userType);

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center bg-gray-50"><div>Loading...</div></div>
      </ProtectedRoute>
    );
  }

  if (!canAccess) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 py-8 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
              <p className="font-medium">Access Denied</p>
              <p className="text-sm">You do not have permission to view this page.</p>
            </div>
            <button onClick={() => router.push(ROUTES.DASHBOARD)} className="mt-4 text-blue-600 hover:text-blue-800">← Back to Dashboard</button>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center mb-6">
            <button onClick={() => router.push(ROUTES.DASHBOARD)} className="mr-4 text-blue-600 hover:text-blue-800">← Back to Dashboard</button>
            <h1 className="text-3xl font-bold">Cash Transfer</h1>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.date ? "border-red-500" : "border-gray-300"}`}
                  required
                />
                {errors.date && <p className="mt-1 text-sm text-red-500">{errors.date}</p>}
              </div>

              {/* From Person (Sender) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From (Sender) <span className="text-red-500">*</span></label>
                {availablePersons.length > 0 ? (
                  <select
                    value={fromPerson}
                    onChange={(e) => { setFromPerson(e.target.value); setErrors({ ...errors, fromPerson: "" }); }}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.fromPerson ? "border-red-500" : "border-gray-300"}`}
                    required
                  >
                    <option value="">-- Select Sender --</option>
                    {availablePersons.map((person) => (
                      <option key={person} value={person}>{person}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={fromPerson}
                    onChange={(e) => { setFromPerson(e.target.value); setErrors({ ...errors, fromPerson: "" }); }}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.fromPerson ? "border-red-500" : "border-gray-300"}`}
                    placeholder="Enter sender name"
                    required
                  />
                )}
                {errors.fromPerson && <p className="mt-1 text-sm text-red-500">{errors.fromPerson}</p>}
              </div>

              {/* To Person (Receiver) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To (Receiver) <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={toPerson}
                  onChange={(e) => { setToPerson(e.target.value); setErrors({ ...errors, toPerson: "" }); }}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.toPerson ? "border-red-500" : "border-gray-300"}`}
                  placeholder="Enter receiver name"
                  required
                />
                {errors.toPerson && <p className="mt-1 text-sm text-red-500">{errors.toPerson}</p>}
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setErrors({ ...errors, amount: "" }); }}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.amount ? "border-red-500" : "border-gray-300"}`}
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  required
                />
                {errors.amount && <p className="mt-1 text-sm text-red-500">{errors.amount}</p>}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-gray-400 text-xs">(optional)</span></label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="Enter reason for transfer (optional)"
                />
              </div>

              {/* Submit Button */}
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium disabled:opacity-50"
                >
                  {saving ? "Processing..." : "Transfer Cash"}
                </button>
                <button
                  type="button"
                  onClick={() => router.push(ROUTES.CASH_TRANSFER_LIST)}
                  className="flex-1 bg-gray-300 text-gray-700 py-3 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 font-medium"
                >
                  View Transfer History
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}