"use client";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useEffect, useState, useRef } from "react";
import { getUserDoc } from "../../utils/getUserDoc";
import { useRouter } from "next/navigation";
import { db } from "../../firebase/config";
import { ref, push, set, get, update } from "firebase/database";
import { logAudit } from "../../utils/auditLog";
import { dbPath, EXPENSE_CATEGORIES, CASH_TRANSACTION_TYPES } from "../../utils/constants";
import { useFinancialYear } from "../../context/FinancialYearContext";
import CashPersonField from "../../components/CashPersonField";
import { recordCashTransaction } from "../../utils/cashManagement";
import { lookupPanByName, savePatronIfNeeded } from "../../utils/panLookup";

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
  const [cashPersonName, setCashPersonName] = useState("");
  const [description, setDescription] = useState("");

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Debounced PAN lookup when name changes
  const panLookupTimer = useRef<NodeJS.Timeout | null>(null);
  const [panLookupLoading, setPanLookupLoading] = useState(false);

  // Category options from constants
  const categoryOptions = [
    { value: "", label: "-- Select Category --" },
    ...EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
  ];

  const isCashWithdrawal = category === "Cash Withdrawal";

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

  // When Cash Withdrawal is selected, force mode to Cheque
  useEffect(() => {
    if (isCashWithdrawal) {
      setModeOfPayment("Cheque");
    }
  }, [isCashWithdrawal]);

  // Watch name changes with debounce for PAN lookup
  useEffect(() => {
    if (panLookupTimer.current) {
      clearTimeout(panLookupTimer.current);
    }
    panLookupTimer.current = setTimeout(() => {
      if (name.trim()) {
        setPanLookupLoading(true);
        lookupPanByName(name, selectedYear).then((pan) => {
          if (pan) {
            setPanNumber(pan);
          }
          setPanLookupLoading(false);
        });
      }
    }, 600);
    return () => {
      if (panLookupTimer.current) {
        clearTimeout(panLookupTimer.current);
      }
    };
  }, [name, selectedYear]);

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

    // For Cash Withdrawal, only Cheque is allowed
    if (isCashWithdrawal && modeOfPayment !== "Cheque") {
      newErrors.modeOfPayment = "Cash Withdrawal must use Cheque mode";
    }

    if ((modeOfPayment === "Cheque" || modeOfPayment === "NEFT") && !chequeNumber.trim()) {
      newErrors.chequeNumber = "Cheque Number is mandatory for " + modeOfPayment;
    }

    if (modeOfPayment === "Cash" && !cashPersonName.trim()) {
      newErrors.cashPersonName = "Cash Paid By is mandatory for Cash payments";
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

        if (isCashWithdrawal) {
          // Cash Withdrawal: NOT an actual expense, just cash movement from bank to person
          // Generate a unique key for audit trail only (no expense record created)
          const withdrawalKey = push(ref(db, dbPath.cashTransactions(currentYear))).key;

          // Create CashIn entry in cash till for the person named
          await recordCashTransaction(
            {
              date,
              amount: expenseAmount,
              transactionType: CASH_TRANSACTION_TYPES.CASH_IN,
              cashPersonName: name.trim(),
              sourceEntity: "Cash Withdrawal",
              sourceEntityKey: withdrawalKey as string,
              sourceReference: billNumber || "N/A",
              inputBy,
              createdBy: user?.uid,
              createdAt: new Date().toISOString(),
            },
            currentYear
          );

          console.log("Cash Withdrawal recorded for:", name.trim(), "Amount:", expenseAmount);
          alert("Cash Withdrawal recorded successfully! Cash credited to " + name.trim());
        } else {
          // Normal expense flow
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
            description: description.trim() || null,
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

          // Record cash transaction if payment mode is Cash
          if (modeOfPayment === "Cash" && cashPersonName.trim()) {
            await recordCashTransaction(
              {
                date,
                amount: expenseAmount,
                transactionType: CASH_TRANSACTION_TYPES.CASH_OUT,
                cashPersonName: cashPersonName.trim(),
                sourceEntity: "Expense",
                sourceEntityKey: expenseKey as string,
                sourceReference: billNumber || "N/A",
                inputBy,
                createdBy: user?.uid,
                createdAt: new Date().toISOString(),
              },
              currentYear
            );
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

          // Save to Patron for future lookups (only for non-cash withdrawal)
          if (!isCashWithdrawal) {
            savePatronIfNeeded(name, panNumber);
          }

          console.log("Expense Data:", expenseData);
          alert("Expense recorded successfully!");
        }

        // Reset form after submission
        setBillNumber("");
        setCategory("");
        setName("");
        setPanNumber("");
        setAmount("");
        setModeOfPayment("");
        setChequeNumber("");
        setCashPersonName("");
        setDescription("");
        setErrors({});
        
      } catch (error) {
        console.error("Error saving:", error);
        alert("Error saving. Please try again.");
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
                <input type="text" value={billNumber} onChange={(e) => setBillNumber(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter bill/cheque number" />
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                  {isCashWithdrawal && <span className="text-blue-500 text-xs ml-1">(Person receiving cash)</span>}
                </label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.name ? "border-red-500" : "border-gray-300"}`} 
                  placeholder="Enter name" 
                />
                {panLookupLoading && <p className="mt-1 text-xs text-blue-600">Looking up PAN...</p>}
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
                    <input type="radio" name="modeOfPayment" value="Cash" checked={modeOfPayment === "Cash"} onChange={(e) => { setModeOfPayment(e.target.value as ModeOfPayment); setErrors({ ...errors, modeOfPayment: "" }); }} disabled={isCashWithdrawal} className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
                    <span className={`ml-2 ${isCashWithdrawal ? 'text-gray-400' : 'text-gray-700'}`}>Cash</span>
                  </label>
                  <label className="flex items-center">
                    <input type="radio" name="modeOfPayment" value="Cheque" checked={modeOfPayment === "Cheque"} onChange={(e) => { setModeOfPayment(e.target.value as ModeOfPayment); setErrors({ ...errors, modeOfPayment: "" }); }} disabled={isCashWithdrawal} className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
                    <span className={`ml-2 ${isCashWithdrawal ? 'text-gray-400' : 'text-gray-700'}`}>Cheque</span>
                  </label>
                  <label className="flex items-center">
                    <input type="radio" name="modeOfPayment" value="NEFT" checked={modeOfPayment === "NEFT"} onChange={(e) => { setModeOfPayment(e.target.value as ModeOfPayment); setErrors({ ...errors, modeOfPayment: "" }); }} disabled={isCashWithdrawal} className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
                    <span className={`ml-2 ${isCashWithdrawal ? 'text-gray-400' : 'text-gray-700'}`}>NEFT</span>
                  </label>
                </div>
                {errors.modeOfPayment && <p className="mt-1 text-sm text-red-500">{errors.modeOfPayment}</p>}
                {isCashWithdrawal && (
                  <p className="mt-1 text-xs text-blue-600">Cash Withdrawal uses Cheque mode only</p>
                )}
              </div>

              {/* Cash Person Field - only for non-Cash Withdrawal */}
              {modeOfPayment === "Cash" && !isCashWithdrawal && (
                <CashPersonField
                  modeOfPayment={modeOfPayment}
                  transactionType="CashOut"
                  cashPersonName={cashPersonName}
                  setCashPersonName={setCashPersonName}
                  error={errors.cashPersonName}
                  setError={(field, value) => setErrors({ ...errors, [field]: value })}
                />
              )}

              {/* Cash Withdrawal Info */}
              {isCashWithdrawal && (
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                  <p className="text-sm text-amber-800">
                    <span className="font-medium">Cash Withdrawal:</span> This is a cash movement from bank account. 
                    The amount will be credited to <strong>{name || "the person named"}</strong>'s cash till. 
                    No expense entry will be created.
                  </p>
                </div>
              )}

              {/* Cheque Number - Conditionally visible and mandatory */}
              {showChequeField && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cheque/Reference Number <span className="text-red-500">*</span></label>
                  <input type="text" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.chequeNumber ? "border-red-500" : "border-gray-300"}`} placeholder={`Enter ${modeOfPayment === "Cheque" ? "cheque" : "reference"} number`} />
                  {errors.chequeNumber && <p className="mt-1 text-sm text-red-500">{errors.chequeNumber}</p>}
                </div>
              )}

              {/* Description - Optional */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-gray-400 text-xs">(optional)</span></label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter any additional details or notes" rows={2} />
              </div>

              {/* Input By */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Input By</label>
                <input type="text" value={inputBy} readOnly className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600" />
              </div>

              {/* Submit Button */}
              <div>
                <button type="submit" className={`w-full py-3 px-4 rounded-md focus:outline-none focus:ring-2 font-medium ${isCashWithdrawal ? 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500' : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'} text-white`}>
                  {isCashWithdrawal ? "Record Cash Withdrawal" : "Submit Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}