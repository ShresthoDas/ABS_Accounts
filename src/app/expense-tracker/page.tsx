"use client";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../utils/getUserDoc";
import { useRouter } from "next/navigation";
import { db } from "../../firebase/config";
import { ref, push, set, get, update } from "firebase/database";
import { logAudit } from "../../utils/auditLog";
import { dbPath, EXPENSE_CATEGORIES } from "../../utils/constants";
import { useFinancialYear } from "../../context/FinancialYearContext";

type ModeOfPayment = "Cash" | "Cheque" | "NEFT";

export default function ExpenseTrackerPage() {
  const { user } = useAuth();
  const { selectedYear } = useFinancialYear();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const router = useRouter();

  // Form state
  const [date, setDate] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [modeOfPayment, setModeOfPayment] = useState<ModeOfPayment | "">("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [inputBy, setInputBy] = useState("");

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Category options from constants
  const categoryOptions = [
    { value: "", label: "-- Select Category --" },
    ...EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
  ];

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid)
        .then((data) => {
          setUserData(data);
          if (data && data.name) {
            setUserName(data.name);
            setInputBy(data.name);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [user]);

  // Set current date as default
  useEffect(() => {
    const today = new Date();
    const formattedDate = today.toISOString().split("T")[0];
    setDate(formattedDate);
  }, []);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!category || category === "") {
      newErrors.category = "Please select a category";
    }

    if (!name.trim()) {
      newErrors.name = "Name is mandatory";
    }

    if (!panNumber.trim()) {
      newErrors.panNumber = "PAN Number is mandatory";
    }

    if (!amount || parseFloat(amount) <= 0) {
      newErrors.amount = "Amount is mandatory and must be greater than 0";
    }

    if (!modeOfPayment) {
      newErrors.modeOfPayment = "Please select a mode of payment";
    }

    if ((modeOfPayment === "Cheque" || modeOfPayment === "NEFT") && !chequeNumber.trim()) {
      newErrors.chequeNumber = "Cheque Number is mandatory for " + modeOfPayment;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (validateForm()) {
      try {
        const expenseAmount = parseFloat(amount);
        const currentYear = selectedYear;
        
        // Create a unique key for this expense record
        const newExpenseRef = push(ref(db, dbPath.expense(currentYear)));
        const expenseKey = newExpenseRef.key;

        const expenseData = {
          key: expenseKey,
          date,
          billNumber,
          category,
          name,
          panNumber,
          amount: expenseAmount,
          modeOfPayment,
          chequeNumber: modeOfPayment === "Cheque" || modeOfPayment === "NEFT" ? chequeNumber : null,
          inputBy,
          createdAt: new Date().toISOString(),
          createdBy: user?.uid,
        };

        // Save expense record to database
        await set(newExpenseRef, expenseData);

        // Update total expense
        const totalExpenseRef = ref(db, dbPath.totalExpense(currentYear));
        const totalSnapshot = await get(totalExpenseRef);
        
        if (totalSnapshot.exists()) {
          await set(totalExpenseRef, totalSnapshot.val() + expenseAmount);
        } else {
          await set(totalExpenseRef, expenseAmount);
        }

        // Log audit for expense creation
        await logAudit({
          action: "CREATE",
          entityType: "Expense",
          entityId: expenseKey as string,
          previousData: null,
          newData: expenseData,
          changedBy: userData?.name || user?.email || "Unknown",
          changedByUid: user?.uid || "",
          changedAt: new Date().toISOString(),
        });

        console.log("Expense Data:", expenseData);
        alert("Expense recorded successfully!");

        // Reset form after submission
        setBillNumber("");
        setCategory("");
        setName("");
        setPanNumber("");
        setAmount("");
        setModeOfPayment("");
        setChequeNumber("");
        setErrors({});
        
      } catch (error) {
        console.error("Error saving expense:", error);
        alert("Error saving expense. Please try again.");
      }
    }
  };

  const showChequeField = modeOfPayment === "Cheque" || modeOfPayment === "NEFT";

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div>Loading...</div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center mb-6">
            <button
              onClick={() => router.push("/dashboard")}
              className="mr-4 text-blue-600 hover:text-blue-800"
            >
              ← Back to Dashboard
            </button>
            <h1 className="text-3xl font-bold">Expense Tracker</h1>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Bill Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bill Number</label>
                <input type="text" value={billNumber} onChange={(e) => setBillNumber(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter bill number" />
              </div>

              {/* Category - Mandatory Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category <span className="text-red-500">*</span></label>
                <select value={category} onChange={(e) => { setCategory(e.target.value); setErrors({ ...errors, category: "" }); }} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.category ? "border-red-500" : "border-gray-300"}`}>
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                {errors.category && <p className="mt-1 text-sm text-red-500">{errors.category}</p>}
              </div>

              {/* Name - Mandatory */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.name ? "border-red-500" : "border-gray-300"}`} placeholder="Enter name" />
                {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
              </div>

              {/* PAN Number - Mandatory */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PAN Number <span className="text-red-500">*</span></label>
                <input type="text" value={panNumber} onChange={(e) => setPanNumber(e.target.value.toUpperCase())} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.panNumber ? "border-red-500" : "border-gray-300"}`} placeholder="Enter PAN number" maxLength={10} />
                {errors.panNumber && <p className="mt-1 text-sm text-red-500">{errors.panNumber}</p>}
              </div>

              {/* Amount - Mandatory */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount <span className="text-red-500">*</span></label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.amount ? "border-red-500" : "border-gray-300"}`} placeholder="Enter amount" step="0.01" min="0" />
                {errors.amount && <p className="mt-1 text-sm text-red-500">{errors.amount}</p>}
              </div>

              {/* Mode of Payment - Mandatory */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Mode of Payment <span className="text-red-500">*</span></label>
                <div className="flex space-x-6">
                  <label className="flex items-center">
                    <input type="radio" name="modeOfPayment" value="Cash" checked={modeOfPayment === "Cash"} onChange={(e) => { setModeOfPayment(e.target.value as ModeOfPayment); setErrors({ ...errors, modeOfPayment: "" }); }} className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
                    <span className="ml-2 text-gray-700">Cash</span>
                  </label>
                  <label className="flex items-center">
                    <input type="radio" name="modeOfPayment" value="Cheque" checked={modeOfPayment === "Cheque"} onChange={(e) => { setModeOfPayment(e.target.value as ModeOfPayment); setErrors({ ...errors, modeOfPayment: "" }); }} className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
                    <span className="ml-2 text-gray-700">Cheque</span>
                  </label>
                  <label className="flex items-center">
                    <input type="radio" name="modeOfPayment" value="NEFT" checked={modeOfPayment === "NEFT"} onChange={(e) => { setModeOfPayment(e.target.value as ModeOfPayment); setErrors({ ...errors, modeOfPayment: "" }); }} className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
                    <span className="ml-2 text-gray-700">NEFT</span>
                  </label>
                </div>
                {errors.modeOfPayment && <p className="mt-1 text-sm text-red-500">{errors.modeOfPayment}</p>}
              </div>

              {/* Cheque Number - Conditionally visible and mandatory */}
              {showChequeField && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cheque/Reference Number <span className="text-red-500">*</span></label>
                  <input type="text" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.chequeNumber ? "border-red-500" : "border-gray-300"}`} placeholder={`Enter ${modeOfPayment === "Cheque" ? "cheque" : "reference"} number`} />
                  {errors.chequeNumber && <p className="mt-1 text-sm text-red-500">{errors.chequeNumber}</p>}
                </div>
              )}

              {/* Input By */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Input By</label>
                <input type="text" value={inputBy} readOnly className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600" />
              </div>

              {/* Submit Button */}
              <div>
                <button type="submit" className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium">Submit Expense</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}