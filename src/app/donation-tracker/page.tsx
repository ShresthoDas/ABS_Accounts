"use client";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../utils/getUserDoc";
import { useRouter } from "next/navigation";
import { db } from "../../firebase/config";
import { ref, push, set, get } from "firebase/database";
import { generateReceiptPDF } from "../../utils/generateReceiptPDF";
import { logAudit } from "../../utils/auditLog";
import { dbPath, ROUTES, hasAccess, DONATION_EVENT_CATEGORIES, requiresReferenceNumber, DEFAULTS, getCurrentYearString, getCurrentYearShort } from "../../utils/constants";

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

type PaymentMode = "Cash" | "Cheque" | "NEFT";

export default function DonationTrackerPage() {
  const { user } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Form state
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [eventCategory, setEventCategory] = useState("");
  const [familyDetails, setFamilyDetails] = useState("");
  const [gotra, setGotra] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [modeOfPayment, setModeOfPayment] = useState<PaymentMode | "">("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [inputBy, setInputBy] = useState("");

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    const paid = roundMoney(parseFloat(paidAmount) || 0);

    if (!name.trim()) newErrors.name = "Name is mandatory";
    if (!panNumber.trim()) newErrors.panNumber = "PAN Number is mandatory";
    if (!mobileNumber.trim()) {
      newErrors.mobileNumber = "Mobile number is mandatory";
    } else if (!/^\d{10}$/.test(mobileNumber.trim())) {
      newErrors.mobileNumber = "Enter a valid 10-digit mobile number";
    }
    if (!eventCategory) newErrors.eventCategory = "Please select an event category";

    const total = roundMoney(parseFloat(totalAmount) || 0);
    if (total <= 0) newErrors.totalAmount = "Total amount must be greater than 0";
    if (paid > total) newErrors.paidAmount = "Paid amount cannot exceed total amount";
    if (paid > 0 && !modeOfPayment) newErrors.modeOfPayment = "Please select a mode of payment";
    if (paid > 0 && requiresReferenceNumber(modeOfPayment) && !chequeNumber.trim()) {
      newErrors.chequeNumber = "Cheque/Reference number is mandatory for " + modeOfPayment;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      try {
        const currentYear = getCurrentYearString();
        const paid = roundMoney(parseFloat(paidAmount) || 0);
        const total = roundMoney(parseFloat(totalAmount) || 0);
        const pending = roundMoney(total - paid);

        const newDonationRef = push(ref(db, dbPath.donations(currentYear)));
        const donationKey = newDonationRef.key;

        const donationData: Record<string, any> = {
          key: donationKey,
          date,
          name: name.trim(),
          panNumber: panNumber.trim().toUpperCase(),
          mobileNumber: mobileNumber.trim(),
          eventCategory,
          familyDetails: familyDetails.trim() || null,
          gotra: gotra.trim() || null,
          totalAmount: total,
          paidAmount: paid,
          pendingAmount: pending,
          inputBy,
          createdAt: new Date().toISOString(),
          createdBy: user?.uid,
        };

        if (paid > 0) {
          donationData.modeOfPayment = modeOfPayment;
          donationData.chequeNumber = requiresReferenceNumber(modeOfPayment) ? chequeNumber : null;

          const receiptYear = getCurrentYearShort();
          const receiptCounterRef = ref(db, dbPath.receiptCounter(receiptYear));
          const counterSnapshot = await get(receiptCounterRef);
          let nextReceiptNum = 1;
          if (counterSnapshot.exists()) nextReceiptNum = counterSnapshot.val() + 1;
          const newReceiptNumber = `ABS/${receiptYear}/${nextReceiptNum}`;

          const newIncomeRef = push(ref(db, dbPath.income(currentYear)));
          const incomeKey = newIncomeRef.key;

          const incomeData = {
            key: incomeKey,
            date,
            receiptNumber: newReceiptNumber,
            name: name.trim(),
            mobileNumber: mobileNumber.trim(),
            panNumber: panNumber.trim().toUpperCase(),
            amount: paid,
            category: DEFAULTS.DONATION_INCOME_CATEGORY,
            modeOfPayment,
            chequeNumber: requiresReferenceNumber(modeOfPayment) ? chequeNumber : null,
            inputBy,
            createdAt: new Date().toISOString(),
            createdBy: user?.uid,
            donationLink: donationKey,
          };

          await set(newIncomeRef, incomeData);

          const totalIncomeRef = ref(db, dbPath.totalIncome(currentYear));
          const totalIncomeSnapshot = await get(totalIncomeRef);
          if (totalIncomeSnapshot.exists()) {
            await set(totalIncomeRef, roundMoney(totalIncomeSnapshot.val() + paid));
          } else {
            await set(totalIncomeRef, paid);
          }

          await set(receiptCounterRef, nextReceiptNum);
          donationData.incomeKey = incomeKey;
          donationData.receiptNumber = newReceiptNumber;
          generateReceiptPDF(incomeData);
        }

        await set(newDonationRef, donationData);

        await logAudit({
          action: "CREATE",
          entityType: "Donation",
          entityId: donationKey as string,
          previousData: null,
          newData: donationData,
          changedBy: userData?.name || user?.email || "Unknown",
          changedByUid: user?.uid || "",
          changedAt: new Date().toISOString(),
        });

        alert("Donation recorded successfully!");
        router.push(ROUTES.DONATION_LIST);
      } catch (error) {
        console.error("Error saving donation:", error);
        alert("Error saving donation. Please try again.");
      }
    }
  };

  const paid = roundMoney(parseFloat(paidAmount) || 0);
  const total = roundMoney(parseFloat(totalAmount) || 0);
  const pending = roundMoney(total - paid);
  const showPaymentDetails = paid > 0;

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center bg-gray-50"><div>Loading...</div></div>
      </ProtectedRoute>
    );
  }

  const canAccess = userData && hasAccess(userData.userType);
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
            <h1 className="text-3xl font-bold">Donation Item</h1>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.name ? "border-red-500" : "border-gray-300"}`} placeholder="Enter name" />
                {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PAN Number <span className="text-red-500">*</span></label>
                <input type="text" value={panNumber} onChange={(e) => setPanNumber(e.target.value.toUpperCase())} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.panNumber ? "border-red-500" : "border-gray-300"}`} placeholder="Enter PAN number" maxLength={10} />
                {errors.panNumber && <p className="mt-1 text-sm text-red-500">{errors.panNumber}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number <span className="text-red-500">*</span></label>
                <input type="tel" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.mobileNumber ? "border-red-500" : "border-gray-300"}`} placeholder="Enter 10-digit mobile number" maxLength={10} />
                {errors.mobileNumber && <p className="mt-1 text-sm text-red-500">{errors.mobileNumber}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Category <span className="text-red-500">*</span></label>
                <select value={eventCategory} onChange={(e) => { setEventCategory(e.target.value); setErrors({ ...errors, eventCategory: "" }); }} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.eventCategory ? "border-red-500" : "border-gray-300"}`}>
                  <option value="">-- Select Event Category --</option>
                  {DONATION_EVENT_CATEGORIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                </select>
                {errors.eventCategory && <p className="mt-1 text-sm text-red-500">{errors.eventCategory}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Family Details</label>
                <textarea value={familyDetails} onChange={(e) => setFamilyDetails(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter family details (if any)" rows={2} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gotra</label>
                <input type="text" value={gotra} onChange={(e) => setGotra(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter gotra (if any)" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Amount (₹) <span className="text-red-500">*</span></label>
                <input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.totalAmount ? "border-red-500" : "border-gray-300"}`} placeholder="Enter total amount" step="0.01" min="0" />
                {errors.totalAmount && <p className="mt-1 text-sm text-red-500">{errors.totalAmount}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Paid Amount (₹) <span className="text-red-500">*</span></label>
                <input type="number" value={paidAmount} onChange={(e) => { setPaidAmount(e.target.value); setErrors({ ...errors, paidAmount: "" }); }} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.paidAmount ? "border-red-500" : "border-gray-300"}`} placeholder="Enter paid amount" step="0.01" min="0" />
                {errors.paidAmount && <p className="mt-1 text-sm text-red-500">{errors.paidAmount}</p>}
              </div>

              {total > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pending Amount</label>
                  <div className={`w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 ${pending > 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}`}>
                    ₹ {Math.max(0, pending).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              )}

              {showPaymentDetails && (
                <>
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

                  {requiresReferenceNumber(modeOfPayment) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{modeOfPayment === "Cheque" ? "Cheque" : "Reference"} Number <span className="text-red-500">*</span></label>
                      <input type="text" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.chequeNumber ? "border-red-500" : "border-gray-300"}`} placeholder={`Enter ${modeOfPayment === "Cheque" ? "cheque" : "reference"} number`} />
                      {errors.chequeNumber && <p className="mt-1 text-sm text-red-500">{errors.chequeNumber}</p>}
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Input By</label>
                <input type="text" value={inputBy} readOnly className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600" />
              </div>

              <div>
                <button type="submit" className="w-full bg-rose-600 text-white py-3 px-4 rounded-md hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium">Submit Donation</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}