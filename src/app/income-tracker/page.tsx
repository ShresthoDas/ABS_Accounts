"use client";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../utils/getUserDoc";
import { useRouter } from "next/navigation";
import { db } from "../../firebase/config";
import { ref, push, set, get, update } from "firebase/database";
import { generateReceiptPDF } from "../../utils/generateReceiptPDF";
import { logAudit } from "../../utils/auditLog";

type ModeOfPayment = "Cash" | "Cheque" | "NEFT";

export default function IncomeTrackerPage() {
  const { user } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const router = useRouter();

  // Form state
  const [date, setDate] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [name, setName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [modeOfPayment, setModeOfPayment] = useState<ModeOfPayment | "">("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [inputBy, setInputBy] = useState("");

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Category options (dummy values - to be filled with actual values later)
  const categoryOptions = [
    { value: "", label: "-- Select Category --" },
    { value: "Donation", label: "Donation" },
    { value: "Membership Fee", label: "Membership Fee" },
    { value: "Event Income", label: "Event Income" },
    { value: "Interest Income", label: "Interest Income" },
    { value: "Rental Income", label: "Rental Income" },
    { value: "Grant", label: "Grant" },
    { value: "Sponsorship", label: "Sponsorship" },
    { value: "Sale Proceeds", label: "Sale Proceeds" },
    { value: "Refund Received", label: "Refund Received" },
    { value: "Other Income", label: "Other Income" },
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

  // Set current date as default and generate receipt number
  useEffect(() => {
    const today = new Date();
    const formattedDate = today.toISOString().split("T")[0];
    setDate(formattedDate);
    
    // Generate receipt number
    generateReceiptNumber();
  }, []);

  const generateReceiptNumber = async () => {
    try {
      // Get current year in YY format
      const currentYear = new Date().getFullYear().toString().slice(-2);
      
      // Reference to the receipt counter in Firebase
      const receiptCounterRef = ref(db, `UAT/Accounts/ReceiptCounters/${currentYear}`);
      const snapshot = await get(receiptCounterRef);
      
      let nextNumber = 1;
      if (snapshot.exists()) {
        nextNumber = snapshot.val() + 1;
      }
      
      // Format: ABS/YY/number
      const newReceiptNumber = `ABS/${currentYear}/${nextNumber}`;
      setReceiptNumber(newReceiptNumber);
    } catch (error) {
      console.error("Error generating receipt number:", error);
      // Fallback to a basic format if there's an error
      const currentYear = new Date().getFullYear().toString().slice(-2);
      setReceiptNumber(`ABS/${currentYear}/1`);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "Name is mandatory";
    }

    if (!panNumber.trim()) {
      newErrors.panNumber = "PAN Number is mandatory";
    }

    if (!amount || parseFloat(amount) <= 0) {
      newErrors.amount = "Amount is mandatory and must be greater than 0";
    }

    if (!category || category === "") {
      newErrors.category = "Please select a category";
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
        const incomeAmount = parseFloat(amount);
        const currentYear = new Date().getFullYear().toString();
        
        // Create a unique key for this income record
        const newIncomeRef = push(ref(db, `UAT/Accounts/${currentYear}/Income`));
        const incomeKey = newIncomeRef.key;

        const incomeData = {
          key: incomeKey,
          date,
          receiptNumber,
          name,
          mobileNumber: mobileNumber || null,
          panNumber,
          amount: incomeAmount,
          category,
          modeOfPayment,
          chequeNumber: modeOfPayment === "Cheque" || modeOfPayment === "NEFT" ? chequeNumber : null,
          inputBy,
          createdAt: new Date().toISOString(),
          createdBy: user?.uid,
        };

        // Save income record to database
        await set(newIncomeRef, incomeData);

        // Update total income
        const totalIncomeRef = ref(db, `UAT/Accounts/${currentYear}/total_income`);
        const totalSnapshot = await get(totalIncomeRef);
        
        if (totalSnapshot.exists()) {
          // Update existing total
          await set(totalIncomeRef, totalSnapshot.val() + incomeAmount
          );
        } else {
          // Create new total with first entry
          await set(totalIncomeRef, incomeAmount);
        }

        // Log audit for income creation
        await logAudit({
          action: "CREATE",
          entityType: "Income",
          entityId: incomeKey as string,
          previousData: null,
          newData: incomeData,
          changedBy: userData?.name || user?.email || "Unknown",
          changedByUid: user?.uid || "",
          changedAt: new Date().toISOString(),
        });

        // Update the receipt counter
        const receiptYear = new Date().getFullYear().toString().slice(-2);
        const receiptCounterRef = ref(db, `UAT/Accounts/ReceiptCounters/${receiptYear}`);
        const counterSnapshot = await get(receiptCounterRef);
        
        if (counterSnapshot.exists()) {
          await set(receiptCounterRef, counterSnapshot.val() + 1);
        } else {
          await set(receiptCounterRef, 1 );
        }

        console.log("Income Data:", incomeData);
        alert("Income recorded successfully!");

        // Store submitted data for PDF generation/download
        setLastSubmittedData(incomeData);

        // Automatically generate and download PDF after successful submission
        generateReceiptPDF(incomeData);

        // Reset form after submission
        setName("");
        setMobileNumber("");
        setPanNumber("");
        setAmount("");
        setCategory("");
        setModeOfPayment("");
        setChequeNumber("");
        setErrors({});
        
        // Generate new receipt number
        generateReceiptNumber();
        
      } catch (error) {
        console.error("Error saving income:", error);
        alert("Error saving income. Please try again.");
      }
    }
  };

  const showChequeField = modeOfPayment === "Cheque" || modeOfPayment === "NEFT";

  // PDF Preview Modal State
  const [showPreview, setShowPreview] = useState(false);
  // Track if income has been submitted (to enable PDF actions)
  const [lastSubmittedData, setLastSubmittedData] = useState<any>(null);

  const handlePreviewPDF = () => {
    // Only allow preview after income has been submitted
    if (!lastSubmittedData) {
      alert("Please submit the income first before previewing the receipt.");
      return;
    }
    setShowPreview(true);
  };

  const handleDownloadPDF = () => {
    // Only allow download after income has been submitted
    if (!lastSubmittedData) {
      alert("Please submit the income first before downloading the receipt.");
      return;
    }
    generateReceiptPDF(lastSubmittedData);
  };

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
            <h1 className="text-3xl font-bold">Income Tracker</h1>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Receipt Number - Auto generated */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Receipt Number
                </label>
                <input
                  type="text"
                  value={receiptNumber}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600"
                />
                <p className="mt-1 text-xs text-gray-500">Auto-generated unique receipt number</p>
              </div>

              {/* Name - Mandatory */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.name ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="Enter name"
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-500">{errors.name}</p>
                )}
              </div>

              {/* Mobile Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter mobile number"
                  maxLength={10}
                />
              </div>

              {/* PAN Number - Mandatory */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PAN Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={panNumber}
                  onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.panNumber ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="Enter PAN number"
                  maxLength={10}
                />
                {errors.panNumber && (
                  <p className="mt-1 text-sm text-red-500">{errors.panNumber}</p>
                )}
              </div>

              {/* Amount - Mandatory */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.amount ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="Enter amount"
                  step="0.01"
                  min="0"
                />
                {errors.amount && (
                  <p className="mt-1 text-sm text-red-500">{errors.amount}</p>
                )}
              </div>

              {/* Category - Mandatory Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setErrors({ ...errors, category: "" });
                  }}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.category ? "border-red-500" : "border-gray-300"
                  }`}
                >
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {errors.category && (
                  <p className="mt-1 text-sm text-red-500">{errors.category}</p>
                )}
              </div>

              {/* Mode of Payment - Mandatory */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mode of Payment <span className="text-red-500">*</span>
                </label>
                <div className="flex space-x-6">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="modeOfPayment"
                      value="Cash"
                      checked={modeOfPayment === "Cash"}
                      onChange={(e) => {
                        setModeOfPayment(e.target.value as ModeOfPayment);
                        setErrors({ ...errors, modeOfPayment: "" });
                      }}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-gray-700">Cash</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="modeOfPayment"
                      value="Cheque"
                      checked={modeOfPayment === "Cheque"}
                      onChange={(e) => {
                        setModeOfPayment(e.target.value as ModeOfPayment);
                        setErrors({ ...errors, modeOfPayment: "" });
                      }}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-gray-700">Cheque</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="modeOfPayment"
                      value="NEFT"
                      checked={modeOfPayment === "NEFT"}
                      onChange={(e) => {
                        setModeOfPayment(e.target.value as ModeOfPayment);
                        setErrors({ ...errors, modeOfPayment: "" });
                      }}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-gray-700">NEFT</span>
                  </label>
                </div>
                {errors.modeOfPayment && (
                  <p className="mt-1 text-sm text-red-500">{errors.modeOfPayment}</p>
                )}
              </div>

              {/* Cheque Number - Conditionally visible and mandatory */}
              {showChequeField && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cheque/Reference Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={chequeNumber}
                    onChange={(e) => setChequeNumber(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.chequeNumber ? "border-red-500" : "border-gray-300"
                    }`}
                    placeholder={`Enter ${modeOfPayment === "Cheque" ? "cheque" : "reference"} number`}
                  />
                  {errors.chequeNumber && (
                    <p className="mt-1 text-sm text-red-500">{errors.chequeNumber}</p>
                  )}
                </div>
              )}

              {/* Input By */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Input By
                </label>
                <input
                  type="text"
                  value={inputBy}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600"
                />
              </div>

              {/* PDF Actions - Only enabled after income submission */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={handlePreviewPDF}
                  disabled={!lastSubmittedData}
                  className={`w-full py-3 px-4 rounded-md focus:outline-none focus:ring-2 font-medium ${
                    lastSubmittedData
                      ? "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500"
                      : "bg-gray-300 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  Preview Receipt
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPDF}
                  disabled={!lastSubmittedData}
                  className={`w-full py-3 px-4 rounded-md focus:outline-none focus:ring-2 font-medium ${
                    lastSubmittedData
                      ? "bg-purple-600 text-white hover:bg-purple-700 focus:ring-purple-500"
                      : "bg-gray-300 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  Download PDF
                </button>
              </div>
              {lastSubmittedData && (
                <p className="text-sm text-green-600 text-center mt-2">
                  ✓ Income submitted - Receipt PDF is available
                </p>
              )}

              {/* Submit Button */}
              <div>
                <button
                  type="submit"
                  className="w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 font-medium"
                >
                  Submit Income
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* PDF Preview Modal */}
        {showPreview && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                <h2 className="text-xl font-bold">Receipt Preview</h2>
                <div className="flex gap-2">
                  <button
                    onClick={handleDownloadPDF}
                    className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 text-sm"
                  >
                    Download PDF
                  </button>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="p-6">
                {lastSubmittedData ? (
                  <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
                    {/* Receipt Header */}
                    <div className="bg-blue-500 text-white p-4 rounded-t-lg -mx-6 -mt-6 mb-6">
                      <h3 className="text-2xl font-bold text-center">ABS ACCOUNTS</h3>
                      <p className="text-center text-sm mt-1">Income Receipt</p>
                    </div>

                    {/* Receipt Number and Date */}
                    <div className="flex justify-between mb-6">
                      <div>
                        <span className="font-bold">Receipt No:</span> {lastSubmittedData.receiptNumber}
                      </div>
                      <div>
                        <span className="font-bold">Date:</span>{' '}
                        {new Date(lastSubmittedData.date).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </div>
                    </div>

                    {/* Donor Information */}
                    <div className="mb-6">
                      <h4 className="font-bold text-lg mb-3 bg-gray-200 px-3 py-2 rounded">Donor Information</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="font-semibold">Name:</span> {lastSubmittedData.name}
                        </div>
                        <div>
                          <span className="font-semibold">PAN Number:</span> {lastSubmittedData.panNumber}
                        </div>
                        {lastSubmittedData.mobileNumber && (
                          <div>
                            <span className="font-semibold">Mobile:</span> {lastSubmittedData.mobileNumber}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Payment Details */}
                    <div className="mb-6">
                      <h4 className="font-bold text-lg mb-3 bg-gray-200 px-3 py-2 rounded">Payment Details</h4>
                      <table className="w-full border-collapse">
                        <tbody>
                          <tr className="border-b">
                            <td className="py-2 font-semibold w-1/3">Category</td>
                            <td className="py-2">{lastSubmittedData.category}</td>
                          </tr>
                          <tr className="border-b">
                            <td className="py-2 font-semibold">Amount</td>
                            <td className="py-2 text-green-600 font-bold">
                              ₹ {lastSubmittedData.amount.toLocaleString('en-IN', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                            </td>
                          </tr>
                          <tr className="border-b">
                            <td className="py-2 font-semibold">Mode of Payment</td>
                            <td className="py-2">{lastSubmittedData.modeOfPayment}</td>
                          </tr>
                          {lastSubmittedData.chequeNumber && (
                            <tr className="border-b">
                              <td className="py-2 font-semibold">
                                {lastSubmittedData.modeOfPayment === 'Cheque' ? 'Cheque' : 'Reference'} Number
                              </td>
                              <td className="py-2">{lastSubmittedData.chequeNumber}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Amount in Words */}
                    <div className="mb-6 italic">
                      <span className="font-semibold">Amount in Words:</span>{' '}
                      {(() => {
                        // Simple amount to words for preview
                        const amt = lastSubmittedData.amount;
                        return `${amt} Rupees Only`;
                      })()}
                    </div>

                    {/* Footer */}
                    <div className="mt-8 pt-4 border-t border-gray-300">
                      <div className="flex justify-between items-end">
                        <div className="text-sm text-gray-600">
                          Entered by: {lastSubmittedData.inputBy}
                        </div>
                        <div className="text-center">
                          <div className="border-b border-gray-400 w-40 mb-1"></div>
                          <p className="text-sm text-gray-500">Authorized Signatory</p>
                        </div>
                      </div>
                    </div>

                    {/* Disclaimer */}
                    <div className="mt-6 text-center text-xs text-gray-500">
                      <p>This is a computer-generated receipt and does not require a physical signature.</p>
                      <p>For any queries, please contact ABS Accounts Department.</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    No submitted income data available for preview.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
