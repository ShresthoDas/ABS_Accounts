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
import { dbPath, ROUTES, hasAccess, DONATION_EVENT_CATEGORIES, requiresReferenceNumber, DEFAULTS, getCurrentYearShort } from "../../utils/constants";
import { useFinancialYear } from "../../context/FinancialYearContext";

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export default function DonationTrackerPage() {
  const { user } = useAuth();
  const { selectedYear } = useFinancialYear();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const router = useRouter();

  const [date, setDate] = useState("");
  const [eventCategory, setEventCategory] = useState("");
  const [donorName, setDonorName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [gotra, setGotra] = useState("");
  const [familyDetails, setFamilyDetails] = useState("");
  const [amount, setAmount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [modeOfPayment, setModeOfPayment] = useState<"Cash" | "Cheque" | "NEFT" | "">("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [inputBy, setInputBy] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const categoryOptions = [{ value: "", label: "-- Select Event Category --" }, ...DONATION_EVENT_CATEGORIES.map((c: any) => ({ value: c.value, label: c.label }))];

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid).then((data) => { setUserData(data); if (data?.name) { setUserName(data.name); setInputBy(data.name); } }).finally(() => setLoading(false));
    }
  }, [user]);

  useEffect(() => { setDate(new Date().toISOString().split("T")[0]); }, []);

  const validateForm = () => {
    const ne: Record<string, string> = {};
    if (!eventCategory) ne.eventCategory = "Select event category";
    if (!donorName.trim()) ne.donorName = "Donor name is mandatory";
    if (!amount || parseFloat(amount) <= 0) ne.amount = "Amount must be > 0";
    const paid = roundMoney(parseFloat(paidAmount) || 0);
    if (paid > 0 && !modeOfPayment) ne.modeOfPayment = "Select mode of payment";
    if (paid > 0 && requiresReferenceNumber(modeOfPayment) && !chequeNumber.trim()) ne.chequeNumber = "Required for " + modeOfPayment;
    setErrors(ne); return Object.keys(ne).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    try {
      const currentYear = selectedYear;
      const paid = roundMoney(parseFloat(paidAmount) || 0);
      const totalAmt = roundMoney(parseFloat(amount) || 0);

      const newDonationRef = push(ref(db, dbPath.donations(currentYear)));
      const donationKey = newDonationRef.key;

      const donationData: Record<string, any> = {
        key: donationKey, date, eventCategory, donorName: donorName.trim(),
        mobileNumber: mobileNumber.trim(), panNumber: panNumber.trim().toUpperCase(),
        gotra: gotra.trim(), familyDetails: familyDetails.trim(),
        amount: totalAmt, paidAmount: paid, pendingAmount: roundMoney(totalAmt - paid),
        inputBy, createdAt: new Date().toISOString(), createdBy: user?.uid,
      };

      if (paid > 0) {
        donationData.modeOfPayment = modeOfPayment;
        donationData.chequeNumber = requiresReferenceNumber(modeOfPayment) ? chequeNumber : null;
        const receiptYear = getCurrentYearShort();
        const rcRef = ref(db, dbPath.receiptCounter(receiptYear));
        const rcSnap = await get(rcRef);
        let nextNum = 1; if (rcSnap.exists()) nextNum = rcSnap.val() + 1;
        const receiptNo = `ABS/${receiptYear}/${nextNum}`;

        const incomeRef = push(ref(db, dbPath.income(currentYear)));
        const incomeKey = incomeRef.key;
        const incomeData = {
          key: incomeKey, date, receiptNumber: receiptNo, name: donorName.trim(),
          mobileNumber: mobileNumber.trim(), panNumber: panNumber.trim().toUpperCase(),
          amount: paid, category: DEFAULTS.DONATION_INCOME_CATEGORY, modeOfPayment,
          chequeNumber: requiresReferenceNumber(modeOfPayment) ? chequeNumber : null,
          inputBy, createdAt: new Date().toISOString(), createdBy: user?.uid, donationLink: donationKey,
        };
        await set(incomeRef, incomeData);
        const tiRef = ref(db, dbPath.totalIncome(currentYear));
        const tiSnap = await get(tiRef);
        await set(tiRef, tiSnap.exists() ? roundMoney(tiSnap.val() + paid) : paid);
        await set(rcRef, nextNum);
        donationData.incomeKey = incomeKey;
        donationData.receiptNumber = receiptNo;

        // Generate receipt PDF
        generateReceiptPDF({
          date,
          receiptNumber: receiptNo,
          name: donorName.trim(),
          panNumber: panNumber.trim().toUpperCase(),
          amount: paid,
          category: DEFAULTS.DONATION_INCOME_CATEGORY,
          modeOfPayment: modeOfPayment || "Cash",
          inputBy: inputBy || userData?.name || "",
        });
      }

      await set(newDonationRef, donationData);
      await logAudit({ action: "CREATE", entityType: "Donation", entityId: donationKey as string, previousData: null, newData: donationData, changedBy: userData?.name || user?.email || "Unknown", changedByUid: user?.uid || "", changedAt: new Date().toISOString() });
      alert("Donation recorded successfully!");
      router.push(ROUTES.DONATION_LIST);
    } catch (error) { console.error("Error:", error); alert("Error saving donation."); }
  };

  const paid = roundMoney(parseFloat(paidAmount) || 0);
  const showPayment = paid > 0;

  if (loading) return (<ProtectedRoute><div className="min-h-screen flex items-center justify-center bg-gray-50"><div>Loading...</div></div></ProtectedRoute>);
  const canAccess = userData && hasAccess(userData.userType);
  if (!canAccess) return (<ProtectedRoute><div className="min-h-screen bg-gray-50 py-8 px-4"><div className="max-w-4xl mx-auto"><div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md"><p className="font-medium">Access Denied</p></div><button onClick={() => router.push(ROUTES.DASHBOARD)} className="mt-4 text-blue-600 hover:text-blue-800">← Back</button></div></div></ProtectedRoute>);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center mb-6"><button onClick={() => router.push(ROUTES.DASHBOARD)} className="mr-4 text-blue-600 hover:text-blue-800">← Back</button><h1 className="text-3xl font-bold">Donation Tracker</h1></div>
          <div className="bg-white p-6 rounded-lg shadow">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Event Category <span className="text-red-500">*</span></label><select value={eventCategory} onChange={(e) => { setEventCategory(e.target.value); setErrors({ ...errors, eventCategory: "" }); }} className={`w-full px-3 py-2 border rounded-md ${errors.eventCategory ? "border-red-500" : "border-gray-300"}`}>{categoryOptions.map((o: any) => (<option key={o.value} value={o.value}>{o.label}</option>))}</select>{errors.eventCategory && <p className="text-sm text-red-500 mt-1">{errors.eventCategory}</p>}</div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Donor Name <span className="text-red-500">*</span></label><input type="text" value={donorName} onChange={(e) => setDonorName(e.target.value)} className={`w-full px-3 py-2 border rounded-md ${errors.donorName ? "border-red-500" : "border-gray-300"}`} placeholder="Enter donor name" />{errors.donorName && <p className="text-sm text-red-500 mt-1">{errors.donorName}</p>}</div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Mobile</label><input type="tel" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" maxLength={10} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">PAN</label><input type="text" value={panNumber} onChange={(e) => setPanNumber(e.target.value.toUpperCase())} className="w-full px-3 py-2 border border-gray-300 rounded-md" maxLength={10} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Gotra</label><input type="text" value={gotra} onChange={(e) => setGotra(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Family Details</label><textarea value={familyDetails} onChange={(e) => setFamilyDetails(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" rows={2} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) <span className="text-red-500">*</span></label><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={`w-full px-3 py-2 border rounded-md ${errors.amount ? "border-red-500" : "border-gray-300"}`} step="0.01" min="0" />{errors.amount && <p className="text-sm text-red-500 mt-1">{errors.amount}</p>}</div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Paid Amount (₹)</label><input type="number" value={paidAmount} onChange={(e) => { setPaidAmount(e.target.value); setErrors({ ...errors, paidAmount: "" }); }} className="w-full px-3 py-2 border border-gray-300 rounded-md" step="0.01" min="0" /></div>
              {showPayment && (<><div><label className="block text-sm font-medium text-gray-700 mb-2">Mode of Payment <span className="text-red-500">*</span></label><div className="flex space-x-6">{(["Cash", "Cheque", "NEFT"] as const).map((m) => (<label key={m} className="flex items-center"><input type="radio" name="mop" value={m} checked={modeOfPayment === m} onChange={() => { setModeOfPayment(m); setErrors({ ...errors, modeOfPayment: "" }); }} className="h-4 w-4 text-blue-600" /><span className="ml-2 text-gray-700">{m}</span></label>))}</div>{errors.modeOfPayment && <p className="text-sm text-red-500 mt-1">{errors.modeOfPayment}</p>}</div>
                {requiresReferenceNumber(modeOfPayment) && (<div><label className="block text-sm font-medium text-gray-700 mb-1">{modeOfPayment === "Cheque" ? "Cheque" : "Reference"} # <span className="text-red-500">*</span></label><input type="text" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} className={`w-full px-3 py-2 border rounded-md ${errors.chequeNumber ? "border-red-500" : "border-gray-300"}`} />{errors.chequeNumber && <p className="text-sm text-red-500 mt-1">{errors.chequeNumber}</p>}</div>)}
              </>)}
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Input By</label><input type="text" value={inputBy} readOnly className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100" /></div>
              <button type="submit" className="w-full bg-rose-600 text-white py-3 rounded-md hover:bg-rose-700 font-medium">Submit Donation</button>
            </form>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}