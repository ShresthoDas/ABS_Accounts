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
import { dbPath, ROUTES, hasAccess, AD_TYPES, PAYMENT_MODES, requiresReferenceNumber, DEFAULTS, getCurrentYearShort } from "../../utils/constants";
import { useFinancialYear } from "../../context/FinancialYearContext";

const roundMoney = (value: number): number => Math.round(value * 100) / 100;
type PaymentMode = "Cash" | "Cheque" | "NEFT";

export default function AdTrackerPage() {
  const { user } = useAuth();
  const { selectedYear } = useFinancialYear();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [adType, setAdType] = useState("");
  const [size, setSize] = useState("");
  const [videoLength, setVideoLength] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [totalAmount, setTotalAmount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [modeOfPayment, setModeOfPayment] = useState<PaymentMode | "">("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [referredBy, setReferredBy] = useState("");
  const [inputBy, setInputBy] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid).then((data) => { setUserData(data); if (data?.name) setInputBy(data.name); }).finally(() => setLoading(false));
    }
  }, [user]);

  useEffect(() => { setDate(new Date().toISOString().split("T")[0]); }, []);

  const validateForm = () => {
    const ne: Record<string, string> = {};
    const paid = roundMoney(parseFloat(paidAmount) || 0);
    if (!name.trim()) ne.name = "Name is mandatory";
    if (!panNumber.trim()) ne.panNumber = "PAN Number is mandatory";
    if (!mobileNumber.trim()) ne.mobileNumber = "Mobile is mandatory";
    else if (!/^\d{10}$/.test(mobileNumber.trim())) ne.mobileNumber = "Invalid mobile";
    if (!adType) ne.adType = "Select ad type";
    if (adType === "Banner" && !size.trim()) ne.size = "Enter size";
    if (adType === "LED" && !videoLength.trim()) ne.videoLength = "Enter video length";
    const total = roundMoney(parseFloat(totalAmount) || 0);
    if (total <= 0) ne.totalAmount = "Amount must be > 0";
    if (paid > total) ne.paidAmount = "Paid cannot exceed total";
    if (paid > 0 && !modeOfPayment) ne.modeOfPayment = "Select payment mode";
    if (paid > 0 && requiresReferenceNumber(modeOfPayment) && !chequeNumber.trim()) ne.chequeNumber = "Required";
    setErrors(ne); return Object.keys(ne).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    try {
      const currentYear = selectedYear;
      const paid = roundMoney(parseFloat(paidAmount) || 0);
      const total = roundMoney(parseFloat(totalAmount) || 0);
      const pending = roundMoney(total - paid);
      const newAdRef = push(ref(db, dbPath.ads(currentYear)));
      const adKey = newAdRef.key;
      const adData: Record<string, any> = { key: adKey, date, name: name.trim(), panNumber: panNumber.trim().toUpperCase(), mobileNumber: mobileNumber.trim(), adType, quantity: parseInt(quantity) || 1, totalAmount: total, paidAmount: paid, pendingAmount: pending, referredBy: referredBy.trim() || null, inputBy, createdAt: new Date().toISOString(), createdBy: user?.uid };
      if (adType === "Banner") adData.size = size.trim();
      else if (adType === "LED") adData.videoLength = videoLength.trim();
      if (paid > 0) {
        adData.modeOfPayment = modeOfPayment;
        adData.chequeNumber = requiresReferenceNumber(modeOfPayment) ? chequeNumber : null;
        const receiptYear = getCurrentYearShort();
        const rcRef = ref(db, dbPath.receiptCounter(receiptYear));
        const rcSnap = await get(rcRef);
        let n = 1; if (rcSnap.exists()) n = rcSnap.val() + 1;
        const rn = `ABS/${receiptYear}/${n}`;
        const incRef = push(ref(db, dbPath.income(currentYear)));
        const ik = incRef.key;
        await set(incRef, { key: ik, date, receiptNumber: rn, name: name.trim(), mobileNumber: mobileNumber.trim(), panNumber: panNumber.trim().toUpperCase(), amount: paid, category: DEFAULTS.AD_INCOME_CATEGORY, modeOfPayment, chequeNumber: requiresReferenceNumber(modeOfPayment) ? chequeNumber : null, referredBy: referredBy.trim() || null, inputBy, createdAt: new Date().toISOString(), createdBy: user?.uid, adLink: adKey });
        const tiRef = ref(db, dbPath.totalIncome(currentYear));
        const tiSnap = await get(tiRef);
        await set(tiRef, tiSnap.exists() ? roundMoney(tiSnap.val() + paid) : paid);
        await set(rcRef, n);
        adData.incomeKey = ik; adData.receiptNumber = rn;
        generateReceiptPDF({ date, receiptNumber: rn, name: name.trim(), panNumber: panNumber.trim().toUpperCase(), amount: paid, category: DEFAULTS.AD_INCOME_CATEGORY, modeOfPayment: modeOfPayment || "Cash", inputBy: inputBy || userData?.name || "" });
      }
      await set(newAdRef, adData);
      await logAudit({ action: "CREATE", entityType: "Ad", entityId: adKey as string, previousData: null, newData: adData, changedBy: userData?.name || user?.email || "Unknown", changedByUid: user?.uid || "", changedAt: new Date().toISOString() });
      alert("Ad booking recorded!"); router.push(ROUTES.AD_LIST);
    } catch (error) { console.error(error); alert("Error."); }
  };

  const paid = roundMoney(parseFloat(paidAmount) || 0);
  const total = roundMoney(parseFloat(totalAmount) || 0);
  const pending = roundMoney(total - paid);

  if (loading) return (<ProtectedRoute><div className="min-h-screen flex items-center justify-center"><div>Loading...</div></div></ProtectedRoute>);
  const canAccess = userData && hasAccess(userData.userType);
  if (!canAccess) return (<ProtectedRoute><div className="min-h-screen bg-gray-50 py-8 px-4"><div className="bg-red-50 border p-3 rounded text-red-700">Access Denied</div><button onClick={() => router.push(ROUTES.DASHBOARD)} className="mt-4 text-blue-600">← Back</button></div></ProtectedRoute>);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center mb-6">
            <button onClick={() => router.push(ROUTES.DASHBOARD)} className="mr-4 text-blue-600 hover:text-blue-800">← Back</button>
            <h1 className="text-3xl font-bold">Ad Booking</h1>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div><label className="block text-sm font-medium">Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 border rounded-md" /></div>
              <div><label className="block text-sm font-medium">Name *</label><input type="text" value={name} onChange={e => setName(e.target.value)} className={`w-full px-3 py-2 border rounded-md ${errors.name ? "border-red-500" : "border-gray-300"}`} />{errors.name && <p className="text-sm text-red-500">{errors.name}</p>}</div>
              <div><label className="block text-sm font-medium">PAN *</label><input type="text" value={panNumber} onChange={e => setPanNumber(e.target.value.toUpperCase())} className={`w-full px-3 py-2 border rounded-md ${errors.panNumber ? "border-red-500" : "border-gray-300"}`} maxLength={10} />{errors.panNumber && <p className="text-sm text-red-500">{errors.panNumber}</p>}</div>
              <div><label className="block text-sm font-medium">Mobile *</label><input type="tel" value={mobileNumber} onChange={e => setMobileNumber(e.target.value)} className={`w-full px-3 py-2 border rounded-md ${errors.mobileNumber ? "border-red-500" : "border-gray-300"}`} maxLength={10} />{errors.mobileNumber && <p className="text-sm text-red-500">{errors.mobileNumber}</p>}</div>
              <div><label className="block text-sm font-medium">Ad Type *</label><select value={adType} onChange={e => { setAdType(e.target.value); setErrors({ ...errors, adType: "" }); }} className={`w-full px-3 py-2 border rounded-md ${errors.adType ? "border-red-500" : "border-gray-300"}`}><option value="">-- Select --</option>{AD_TYPES.map(t => (<option key={t.value} value={t.value}>{t.label}</option>))}</select>{errors.adType && <p className="text-sm text-red-500">{errors.adType}</p>}</div>
              {adType === "Banner" && (<div><label className="block text-sm font-medium">Size *</label><input type="text" value={size} onChange={e => setSize(e.target.value)} className={`w-full px-3 py-2 border rounded-md ${errors.size ? "border-red-500" : "border-gray-300"}`} />{errors.size && <p className="text-sm text-red-500">{errors.size}</p>}</div>)}
              {adType === "LED" && (<div><label className="block text-sm font-medium">Video Length (sec) *</label><input type="text" value={videoLength} onChange={e => setVideoLength(e.target.value)} className={`w-full px-3 py-2 border rounded-md ${errors.videoLength ? "border-red-500" : "border-gray-300"}`} />{errors.videoLength && <p className="text-sm text-red-500">{errors.videoLength}</p>}</div>)}
              <div><label className="block text-sm font-medium">Quantity</label><input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} className="w-full px-3 py-2 border rounded-md" min="1" /></div>
              <div><label className="block text-sm font-medium">Total Amount *</label><input type="number" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} className={`w-full px-3 py-2 border rounded-md ${errors.totalAmount ? "border-red-500" : "border-gray-300"}`} step="0.01" min="0" />{errors.totalAmount && <p className="text-sm text-red-500">{errors.totalAmount}</p>}</div>
              <div><label className="block text-sm font-medium">Paid Amount *</label><input type="number" value={paidAmount} onChange={e => { setPaidAmount(e.target.value); setErrors({ ...errors, paidAmount: "" }); }} className={`w-full px-3 py-2 border rounded-md ${errors.paidAmount ? "border-red-500" : "border-gray-300"}`} step="0.01" min="0" />{errors.paidAmount && <p className="text-sm text-red-500">{errors.paidAmount}</p>}</div>
              {(total > 0) && (<div><label className="block text-sm font-medium">Pending</label><div className={`w-full px-3 py-2 border rounded-md bg-gray-100 ${pending > 0 ? "text-red-600" : "text-green-600"}`}>₹ {Math.max(0, pending).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>)}
              {paid > 0 && (<><div><label className="block text-sm font-medium">Mode *</label><div className="flex gap-4">{(["Cash", "Cheque", "NEFT"] as PaymentMode[]).map(m => (<label key={m} className="flex items-center"><input type="radio" name="mop" value={m} checked={modeOfPayment === m} onChange={() => setModeOfPayment(m)} className="h-4 w-4" /><span className="ml-1">{m}</span></label>))}</div>{errors.modeOfPayment && <p className="text-sm text-red-500">{errors.modeOfPayment}</p>}</div>
                {requiresReferenceNumber(modeOfPayment) && (<div><label className="block text-sm font-medium">{modeOfPayment === "Cheque" ? "Cheque" : "Reference"} # *</label><input type="text" value={chequeNumber} onChange={e => setChequeNumber(e.target.value)} className={`w-full px-3 py-2 border rounded-md ${errors.chequeNumber ? "border-red-500" : "border-gray-300"}`} />{errors.chequeNumber && <p className="text-sm text-red-500">{errors.chequeNumber}</p>}</div>)}
              </>)}
              <div><label className="block text-sm font-medium">Referred By</label><input type="text" value={referredBy} onChange={e => setReferredBy(e.target.value)} className="w-full px-3 py-2 border rounded-md" placeholder="Enter referrer name (optional)" /></div>
              <div><label className="block text-sm font-medium">Input By</label><input type="text" value={inputBy} readOnly className="w-full px-3 py-2 border rounded-md bg-gray-100" /></div>
              <button type="submit" className="w-full bg-teal-600 text-white py-3 rounded-md hover:bg-teal-700 font-medium">Submit</button>
            </form>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}