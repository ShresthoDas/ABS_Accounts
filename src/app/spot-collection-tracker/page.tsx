"use client";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useEffect, useState, useRef } from "react";
import { getUserDoc } from "../../utils/getUserDoc";
import { useRouter } from "next/navigation";
import { db } from "../../firebase/config";
import { ref, push, set, get } from "firebase/database";
import { generateReceiptPDF } from "../../utils/generateReceiptPDF";
import { logAudit } from "../../utils/auditLog";
import { dbPath, ROUTES, requiresReferenceNumber, DEFAULTS, getCurrentYearShort, CASH_TRANSACTION_TYPES } from "../../utils/constants";
import { useFinancialYear } from "../../context/FinancialYearContext";
import CashPersonField from "../../components/CashPersonField";
import { recordCashTransaction } from "../../utils/cashManagement";
import { lookupPanByName, savePatronIfNeeded } from "../../utils/panLookup";

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

type PaymentMode = "Cash" | "Cheque" | "NEFT";

const SPOT_COLLECTION_ALLOWED_TYPES = ["Accounts", "GB", "Front Office"];

export default function SpotCollectionTrackerPage() {
  const { user } = useAuth();
  const { selectedYear } = useFinancialYear();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Form state
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [modeOfPayment, setModeOfPayment] = useState<PaymentMode | "">("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [inputBy, setInputBy] = useState("");
  const [cashPersonName, setCashPersonName] = useState("");

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid)
        .then((data) => {
          setUserData(data);
          if (data && data.name) setInputBy(data.name);
        })
        .finally(() => setLoading(false));
    }
  }, [user]);

  useEffect(() => {
    const today = new Date();
    setDate(today.toISOString().split("T")[0]);
  }, []);

  // Debounced PAN lookup when name changes
  const panLookupTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (panLookupTimer.current) {
      clearTimeout(panLookupTimer.current);
    }
    panLookupTimer.current = setTimeout(() => {
      lookupPanByName(name, selectedYear).then((pan) => {
        setPanNumber(pan);
      });
    }, 600);
    return () => {
      if (panLookupTimer.current) {
        clearTimeout(panLookupTimer.current);
      }
    };
  }, [name]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    const amt = roundMoney(parseFloat(amount) || 0);

    if (!name.trim()) newErrors.name = "Name is mandatory";
    if (!panNumber.trim()) newErrors.panNumber = "PAN Number is mandatory";
    if (panNumber.trim() && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber.trim().toUpperCase())) {
      newErrors.panNumber = "Enter a valid PAN number";
    }
    if (amt <= 0) newErrors.amount = "Amount must be greater than 0";
    if (!modeOfPayment) newErrors.modeOfPayment = "Please select a mode of payment";
    if (requiresReferenceNumber(modeOfPayment) && !chequeNumber.trim()) {
      newErrors.chequeNumber = "Cheque/Reference number is mandatory for " + modeOfPayment;
    }

    if (modeOfPayment === "Cash" && !cashPersonName.trim()) {
      newErrors.cashPersonName = "Cash Received By is mandatory for Cash payments";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      try {
        setSubmitting(true);
        const currentYear = selectedYear;
        const amt = roundMoney(parseFloat(amount) || 0);

        // Generate receipt number
        const receiptYear = getCurrentYearShort();
        const receiptCounterRef = ref(db, dbPath.receiptCounter(receiptYear));
        const counterSnapshot = await get(receiptCounterRef);
        let nextReceiptNum = 1;
        if (counterSnapshot.exists()) nextReceiptNum = counterSnapshot.val() + 1;
        const newReceiptNumber = `ABS/${receiptYear}/${nextReceiptNum}`;

        // Create Spot Collection record
        const newSpotRef = push(ref(db, dbPath.spotCollection(currentYear)));
        const spotKey = newSpotRef.key;

        const spotData: Record<string, any> = {
          key: spotKey,
          date,
          receiptNumber: newReceiptNumber,
          name: name.trim(),
          mobileNumber: mobileNumber.trim() || null,
          panNumber: panNumber.trim().toUpperCase(),
          amount: amt,
          category: DEFAULTS.SPOT_COLLECTION_INCOME_CATEGORY,
          modeOfPayment,
          chequeNumber: requiresReferenceNumber(modeOfPayment) ? chequeNumber : null,
          inputBy,
          createdAt: new Date().toISOString(),
          createdBy: user?.uid,
        };

        // Create linked income record
        const newIncomeRef = push(ref(db, dbPath.income(currentYear)));
        const incomeKey = newIncomeRef.key;

        const incomeData = {
          key: incomeKey,
          date,
          receiptNumber: newReceiptNumber,
          name: name.trim(),
          mobileNumber: mobileNumber.trim() || null,
          panNumber: panNumber.trim().toUpperCase(),
          amount: amt,
          category: DEFAULTS.SPOT_COLLECTION_INCOME_CATEGORY, 
          modeOfPayment,
          chequeNumber: requiresReferenceNumber(modeOfPayment) ? chequeNumber : null,
          inputBy,
          createdAt: new Date().toISOString(),
          createdBy: user?.uid,
          spotCollectionLink: spotKey,
        };

        const receiptData = {
          key: incomeKey,
          date,
          receiptNumber: newReceiptNumber,
          name: name.trim(),
          mobileNumber: mobileNumber.trim() || null,
          panNumber: panNumber.trim().toUpperCase(),
          amount: amt,
          category: "Donation", // Using "Donation" category for spot collections
          modeOfPayment,
          chequeNumber: requiresReferenceNumber(modeOfPayment) ? chequeNumber : null,
          inputBy,
          createdAt: new Date().toISOString(),
          createdBy: user?.uid,
          spotCollectionLink: spotKey,
        };

        // Record cash transaction if payment mode is Cash
        if (modeOfPayment === "Cash" && cashPersonName.trim()) {
          await recordCashTransaction(
            {
              date,
              amount: amt,
              transactionType: CASH_TRANSACTION_TYPES.CASH_IN,
              cashPersonName: cashPersonName.trim(),
              sourceEntity: "SpotCollection",
              sourceEntityKey: spotKey as string,
              sourceReference: newReceiptNumber,
              inputBy,
              createdBy: user?.uid,
              createdAt: new Date().toISOString(),
            },
            currentYear
          );
        }

        await set(newIncomeRef, incomeData);

        // Update total income
        const totalIncomeRef = ref(db, dbPath.totalIncome(currentYear));
        const totalIncomeSnapshot = await get(totalIncomeRef);
        if (totalIncomeSnapshot.exists()) {
          await set(totalIncomeRef, roundMoney(totalIncomeSnapshot.val() + amt));
        } else {
          await set(totalIncomeRef, amt);
        }

        // Update receipt counter
        await set(receiptCounterRef, nextReceiptNum);

        spotData.incomeKey = incomeKey;
        await set(newSpotRef, spotData);

        await logAudit({
          action: "CREATE",
          entityType: "SpotCollection",
          entityId: spotKey as string,
          previousData: null,
          newData: spotData,
          changedBy: userData?.name || user?.email || "Unknown",
          changedByUid: user?.uid || "",
          changedAt: new Date().toISOString(),
        });

        // Save to Patron for future lookups
        savePatronIfNeeded(name, panNumber);

        generateReceiptPDF(receiptData);

        alert("Spot Collection recorded successfully!");
        router.push(ROUTES.SPOT_COLLECTION_LIST);
      } catch (error) {
        console.error("Error saving spot collection:", error);
        alert("Error saving spot collection. Please try again.");
      } finally {
        setSubmitting(false);
      }
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center bg-gray-50"><div>Loading...</div></div>
      </ProtectedRoute>
    );
  }

  const canAccess = userData && SPOT_COLLECTION_ALLOWED_TYPES.includes(userData.userType);
  if (!canAccess) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 py-8 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md"><p className="font-medium">Access Denied</p><p className="text-sm">You do not have permission to view this page.</p></div>
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
            <h1 className="text-3xl font-bold">Spot Collection</h1>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Receipt Number <span className="text-gray-500">(Auto-generated)</span></label>
                <input type="text" value="Auto-generated on submit" disabled className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500 italic" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.name ? "border-red-500" : "border-gray-300"}`} placeholder="Enter name" />
                {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
                <input type="tel" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter mobile number (optional)" maxLength={10} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PAN Number <span className="text-red-500">*</span></label>
                <input type="text" value={panNumber} onChange={(e) => setPanNumber(e.target.value.toUpperCase())} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.panNumber ? "border-red-500" : "border-gray-300"}`} placeholder="Enter PAN number" maxLength={10} />
                {errors.panNumber && <p className="mt-1 text-sm text-red-500">{errors.panNumber}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) <span className="text-red-500">*</span></label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.amount ? "border-red-500" : "border-gray-300"}`} placeholder="Enter amount" step="0.01" min="0" />
                {errors.amount && <p className="mt-1 text-sm text-red-500">{errors.amount}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Mode of Payment <span className="text-red-500">*</span></label>
                <div className="flex space-x-6">
                  {(["Cash", "Cheque", "NEFT"] as PaymentMode[]).map((mop) => (
                    <label key={mop} className="flex items-center">
                      <input type="radio" name="modeOfPayment" value={mop} checked={modeOfPayment === mop} onChange={(e) => { setModeOfPayment(e.target.value as PaymentMode); setErrors({ ...errors, modeOfPayment: "" }); }} className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
                      <span className="ml-2 text-gray-700">{mop}</span>
                    </label>
                  ))}
                </div>
                {errors.modeOfPayment && <p className="mt-1 text-sm text-red-500">{errors.modeOfPayment}</p>}
              </div>

              {modeOfPayment === "Cash" && (
                <CashPersonField
                  modeOfPayment={modeOfPayment}
                  transactionType="CashIn"
                  cashPersonName={cashPersonName}
                  setCashPersonName={setCashPersonName}
                  error={errors.cashPersonName}
                  setError={(field, value) => setErrors({ ...errors, [field]: value })}
                />
              )}

              {requiresReferenceNumber(modeOfPayment) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{modeOfPayment === "Cheque" ? "Cheque" : "Reference"} Number <span className="text-red-500">*</span></label>
                  <input type="text" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.chequeNumber ? "border-red-500" : "border-gray-300"}`} placeholder={`Enter ${modeOfPayment === "Cheque" ? "cheque" : "reference"} number`} />
                  {errors.chequeNumber && <p className="mt-1 text-sm text-red-500">{errors.chequeNumber}</p>}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Input By</label>
                <input type="text" value={inputBy} readOnly className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600" />
              </div>

              <div>
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {submitting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processing...
                    </>
                  ) : (
                    "Submit Spot Collection"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}