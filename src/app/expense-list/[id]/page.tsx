"use client";
import { useAuth } from "../../../context/AuthContext";
import ProtectedRoute from "../../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../../utils/getUserDoc";
import { useRouter, useParams } from "next/navigation";
import { db } from "../../../firebase/config";
import { ref, get, set, update, remove } from "firebase/database";
import { logAudit } from "../../../utils/auditLog";

interface ExpenseItem {
  key: string;
  date: string;
  billNumber: string;
  name: string;
  panNumber?: string;
  amount: number;
  category: string;
  modeOfPayment?: string;
  chequeNumber?: string | null;
  inputBy?: string;
  createdBy?: string;
  createdAt?: string;
}

type ModeOfPayment = "Cash" | "Cheque" | "NEFT";

export default function ExpenseDetailPage() {
  const { user } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expense, setExpense] = useState<ExpenseItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const router = useRouter();
  const params = useParams();

  // Edit form state
  const [date, setDate] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [name, setName] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [modeOfPayment, setModeOfPayment] = useState<ModeOfPayment | "">("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [inputBy, setInputBy] = useState("");

  const categoryOptions = [
    { value: "Office Supplies", label: "Office Supplies" },
    { value: "Travel", label: "Travel" },
    { value: "Food & Beverages", label: "Food & Beverages" },
    { value: "Utilities", label: "Utilities" },
    { value: "Maintenance", label: "Maintenance" },
    { value: "Marketing", label: "Marketing" },
    { value: "Professional Services", label: "Professional Services" },
    { value: "Rent", label: "Rent" },
    { value: "Insurance", label: "Insurance" },
    { value: "Other", label: "Other" },
  ];

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid)
        .then((data) => {
          setUserData(data);
        })
        .finally(() => setLoading(false));
    }
  }, [user]);

  useEffect(() => {
    if (userData && params.id) {
      fetchExpenseDetail();
    }
  }, [userData, params.id]);

  const fetchExpenseDetail = async () => {
    try {
      setLoading(true);
      const currentYear = new Date().getFullYear().toString();
      const expenseRef = ref(db, `UAT/Accounts/${currentYear}/Expense/${params.id}`);
      const snapshot = await get(expenseRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        const expenseItem: ExpenseItem = {
          key: params.id as string,
          ...data,
        };
        setExpense(expenseItem);
        // Populate edit form
        setDate(expenseItem.date || "");
        setBillNumber(expenseItem.billNumber || "");
        setName(expenseItem.name || "");
        setPanNumber(expenseItem.panNumber || "");
        setAmount(expenseItem.amount?.toString() || "");
        setCategory(expenseItem.category || "");
        setModeOfPayment((expenseItem.modeOfPayment as ModeOfPayment) || "");
        setChequeNumber(expenseItem.chequeNumber || "");
        setInputBy(expenseItem.inputBy || "");
      } else {
        setExpense(null);
      }
    } catch (error) {
      console.error("Error fetching expense:", error);
      setExpense(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!expense || !userData || !user) return;
    try {
      setSaving(true);
      const currentYear = new Date().getFullYear().toString();
      const expenseRef = ref(db, `UAT/Accounts/${currentYear}/Expense/${params.id}`);

      // Get old data for audit
      const oldData = { ...expense };

      // Remove the expense record
      await remove(expenseRef);

      // Update total expense
      const totalExpenseRef = ref(db, `UAT/Accounts/${currentYear}/total_expense`);
      const totalSnapshot = await get(totalExpenseRef);
      if (totalSnapshot.exists()) {
        await set(totalExpenseRef, totalSnapshot.val() - expense.amount);
      }

      // Log audit
      await logAudit({
        action: "DELETE",
        entityType: "Expense",
        entityId: params.id as string,
        previousData: oldData,
        newData: null,
        changedBy: userData.name || user.email || "Unknown",
        changedByUid: user.uid,
        changedAt: new Date().toISOString(),
      });

      alert("Expense record deleted successfully!");
      router.push("/expense-list");
    } catch (error) {
      console.error("Error deleting expense:", error);
      alert("Error deleting expense. Please try again.");
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expense || !userData || !user) return;

    if (!name.trim() || !panNumber.trim() || !amount || parseFloat(amount) <= 0 || !category || !modeOfPayment) {
      alert("Please fill in all required fields.");
      return;
    }

    try {
      setSaving(true);
      const currentYear = new Date().getFullYear().toString();
      const expenseRef = ref(db, `UAT/Accounts/${currentYear}/Expense/${params.id}`);
      const newAmount = parseFloat(amount);
      const amountDifference = newAmount - expense.amount;

      // Get old data for audit
      const oldData = { ...expense };

      const updatedData = {
        date,
        billNumber,
        name: name.trim(),
        panNumber: panNumber.trim().toUpperCase(),
        amount: newAmount,
        category,
        modeOfPayment,
        chequeNumber: (modeOfPayment === "Cheque" || modeOfPayment === "NEFT") ? chequeNumber : null,
        inputBy: inputBy || userData.name,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      };

      // Update expense record
      await update(expenseRef, updatedData);

      // Adjust total expense if amount changed
      if (amountDifference !== 0) {
        const totalExpenseRef = ref(db, `UAT/Accounts/${currentYear}/total_expense`);
        const totalSnapshot = await get(totalExpenseRef);
        if (totalSnapshot.exists()) {
          await set(totalExpenseRef, totalSnapshot.val() + amountDifference);
        }
      }

      // Log audit
      await logAudit({
        action: "UPDATE",
        entityType: "Expense",
        entityId: params.id as string,
        previousData: oldData,
        newData: { ...oldData, ...updatedData },
        changedBy: userData.name || user.email || "Unknown",
        changedByUid: user.uid,
        changedAt: new Date().toISOString(),
      });

      alert("Expense record updated successfully!");
      setIsEditing(false);
      fetchExpenseDetail();
    } catch (error) {
      console.error("Error updating expense:", error);
      alert("Error updating expense. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const canAccess = userData && 
    (userData.userType === "Accounts" || userData.userType === "GB");

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div>Loading...</div>
        </div>
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
            <button
              onClick={() => router.push("/dashboard")}
              className="mt-4 text-blue-600 hover:text-blue-800"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!expense) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 py-8 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md">
              Expense record not found.
            </div>
            <button
              onClick={() => router.push("/expense-list")}
              className="mt-4 text-blue-600 hover:text-blue-800"
            >
              ← Back to Expense List
            </button>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center mb-6">
            <button
              onClick={() => router.push("/expense-list")}
              className="mr-4 text-blue-600 hover:text-blue-800"
            >
              ← Back to Expense List
            </button>
            <h1 className="text-3xl font-bold">
              {isEditing ? "Edit Expense" : "Expense Details"}
            </h1>
          </div>

          {isEditing ? (
            /* Edit Form */
            <div className="bg-white p-6 rounded-lg shadow">
              <form onSubmit={handleEdit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bill Number</label>
                  <input
                    type="text"
                    value={billNumber}
                    onChange={(e) => setBillNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    PAN Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={panNumber}
                    onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    maxLength={10}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    step="0.01"
                    min="0"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">-- Select Category --</option>
                    {categoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mode of Payment <span className="text-red-500">*</span>
                  </label>
                  <div className="flex space-x-6">
                    {(["Cash", "Cheque", "NEFT"] as ModeOfPayment[]).map((mop) => (
                      <label key={mop} className="flex items-center">
                        <input
                          type="radio"
                          name="modeOfPayment"
                          value={mop}
                          checked={modeOfPayment === mop}
                          onChange={(e) => setModeOfPayment(e.target.value as ModeOfPayment)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-gray-700">{mop}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {(modeOfPayment === "Cheque" || modeOfPayment === "NEFT") && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {modeOfPayment === "Cheque" ? "Cheque" : "Reference"} Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={chequeNumber}
                      onChange={(e) => setChequeNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Input By</label>
                  <input
                    type="text"
                    value={inputBy}
                    onChange={(e) => setInputBy(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      if (expense) {
                        setDate(expense.date || "");
                        setBillNumber(expense.billNumber || "");
                        setName(expense.name || "");
                        setPanNumber(expense.panNumber || "");
                        setAmount(expense.amount?.toString() || "");
                        setCategory(expense.category || "");
                        setModeOfPayment((expense.modeOfPayment as ModeOfPayment) || "");
                        setChequeNumber(expense.chequeNumber || "");
                        setInputBy(expense.inputBy || "");
                      }
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 py-3 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* Detail View */
            <>
              {/* Action Buttons */}
              <div className="flex gap-3 mb-6">
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
              </div>

              {/* Detail Card */}
              <div className="bg-white rounded-lg shadow overflow-hidden">
                {/* Header */}
                <div className="bg-red-500 text-white p-6">
                  <h2 className="text-2xl font-bold">{expense.name}</h2>
                  <p className="text-red-100 mt-1">
                    {new Date(expense.date).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    })}
                    {expense.billNumber && <span className="ml-4">Bill: {expense.billNumber}</span>}
                  </p>
                </div>

                {/* Details */}
                <div className="p-6 space-y-6">
                  {/* Vendor / Payee Information */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Payee Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Name</p>
                        <p className="text-base font-medium text-gray-900">{expense.name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">PAN Number</p>
                        <p className="text-base font-medium text-gray-900">{expense.panNumber || '-'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Payment Details */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Payment Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Category</p>
                        <p className="text-base font-medium text-gray-900">{expense.category}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Amount</p>
                        <p className="text-2xl font-bold text-red-600">
                          ₹ {expense.amount.toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Mode of Payment</p>
                        <p className="text-base font-medium text-gray-900">{expense.modeOfPayment || 'Cash'}</p>
                      </div>
                      {expense.chequeNumber && (
                        <div>
                          <p className="text-sm text-gray-500">
                            {expense.modeOfPayment === 'Cheque' ? 'Cheque' : 'Reference'} Number
                          </p>
                          <p className="text-base font-medium text-gray-900">{expense.chequeNumber}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Metadata */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Record Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Input By</p>
                        <p className="text-base font-medium text-gray-900">{expense.inputBy || '-'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Created At</p>
                        <p className="text-base font-medium text-gray-900">
                          {expense.createdAt
                            ? new Date(expense.createdAt).toLocaleString('en-IN')
                            : '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Delete Confirmation Modal */}
          {showDeleteConfirm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Confirm Delete</h2>
                <p className="text-gray-600 mb-2">
                  Are you sure you want to delete this expense record?
                </p>
                <p className="text-sm text-red-600 mb-6">
                  Name: <strong>{expense.name}</strong> — ₹ {expense.amount.toLocaleString('en-IN')}
                  <br />
                  This action will also adjust the total expense and cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium disabled:opacity-50"
                  >
                    {saving ? "Deleting..." : "Yes, Delete"}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={saving}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}