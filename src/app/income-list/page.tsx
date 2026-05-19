"use client";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../utils/getUserDoc";
import { useRouter } from "next/navigation";
import { db } from "../../firebase/config";
import { ref, get } from "firebase/database";
import { generateReceiptPDF } from "../../utils/generateReceiptPDF";

interface IncomeItem {
  key: string;
  date: string;
  receiptNumber: string;
  name: string;
  mobileNumber?: string | null;
  panNumber?: string;
  amount: number;
  category: string;
  modeOfPayment?: string;
  chequeNumber?: string | null;
  inputBy?: string;
  createdBy?: string;
  createdAt?: string;
}

export default function IncomeListPage() {
  const { user } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [incomes, setIncomes] = useState<IncomeItem[]>([]);
  const [incomesLoading, setIncomesLoading] = useState(true);
  const [selectedIncome, setSelectedIncome] = useState<IncomeItem | null>(null);
  const router = useRouter();

  const handleDownloadPDF = (income: IncomeItem) => {
    const incomeData = {
      date: income.date,
      receiptNumber: income.receiptNumber,
      name: income.name,
      mobileNumber: income.mobileNumber || null,
      panNumber: income.panNumber || '',
      amount: income.amount,
      category: income.category,
      modeOfPayment: income.modeOfPayment || 'Cash',
      chequeNumber: income.chequeNumber || null,
      inputBy: income.inputBy || '',
      createdBy: income.createdBy,
      createdAt: income.createdAt,
    };
    generateReceiptPDF(incomeData);
  };

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
    if (userData) {
      fetchIncomes();
    }
  }, [userData]);

  const fetchIncomes = async () => {
    try {
      setIncomesLoading(true);
      const currentYear = new Date().getFullYear().toString();
      const incomesRef = ref(db, `UAT/Accounts/${currentYear}/Income`);
      const snapshot = await get(incomesRef);
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        const incomeList: IncomeItem[] = Object.keys(data).map((key) => ({
          key,
          ...data[key],
        }));
        
        // Sort by date descending (most recent first)
        incomeList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setIncomes(incomeList);
      } else {
        setIncomes([]);
      }
    } catch (error) {
      console.error("Error fetching incomes:", error);
      setIncomes([]);
    } finally {
      setIncomesLoading(false);
    }
  };

  // Check if user has permission to access this page
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

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center mb-6">
            <button
              onClick={() => router.push("/dashboard")}
              className="mr-4 text-blue-600 hover:text-blue-800"
            >
              ← Back to Dashboard
            </button>
            <h1 className="text-3xl font-bold">Income List</h1>
          </div>

          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">
                  Incomes for {new Date().getFullYear()}
                </h2>
                <button
                  onClick={fetchIncomes}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  Refresh
                </button>
              </div>
            </div>

            {incomesLoading ? (
              <div className="p-6 text-center text-gray-500">
                Loading incomes...
              </div>
            ) : incomes.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                No incomes found for this year.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Receipt Number
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {incomes.map((income) => (
                      <tr key={income.key} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(income.date).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {income.receiptNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {income.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {income.category}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <button
                            onClick={() => handleDownloadPDF(income)}
                            className="text-purple-600 hover:text-purple-800 text-sm font-medium flex items-center justify-end gap-1 ml-auto"
                            title="Download Receipt PDF"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            PDF
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-green-600">
                          ₹ {income.amount.toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                        Total:
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-bold text-green-600">
                        ₹ {incomes.reduce((sum, i) => sum + i.amount, 0).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* PDF Preview Modal */}
        {selectedIncome && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                <h2 className="text-xl font-bold">Receipt Preview - {selectedIncome.receiptNumber}</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      handleDownloadPDF(selectedIncome);
                      setSelectedIncome(null);
                    }}
                    className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 text-sm"
                  >
                    Download PDF
                  </button>
                  <button
                    onClick={() => setSelectedIncome(null)}
                    className="text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="p-6">
                <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
                  {/* Receipt Header */}
                  <div className="bg-blue-500 text-white p-4 rounded-t-lg -mx-6 -mt-6 mb-6">
                    <h3 className="text-2xl font-bold text-center">ABS ACCOUNTS</h3>
                    <p className="text-center text-sm mt-1">Income Receipt</p>
                  </div>

                  {/* Receipt Number and Date */}
                  <div className="flex justify-between mb-6">
                    <div>
                      <span className="font-bold">Receipt No:</span> {selectedIncome.receiptNumber}
                    </div>
                    <div>
                      <span className="font-bold">Date:</span>{' '}
                      {new Date(selectedIncome.date).toLocaleDateString('en-IN', {
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
                        <span className="font-semibold">Name:</span> {selectedIncome.name}
                      </div>
                      {selectedIncome.panNumber && (
                        <div>
                          <span className="font-semibold">PAN Number:</span> {selectedIncome.panNumber}
                        </div>
                      )}
                      {selectedIncome.mobileNumber && (
                        <div>
                          <span className="font-semibold">Mobile:</span> {selectedIncome.mobileNumber}
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
                          <td className="py-2">{selectedIncome.category}</td>
                        </tr>
                        <tr className="border-b">
                          <td className="py-2 font-semibold">Amount</td>
                          <td className="py-2 text-green-600 font-bold">
                            ₹ {selectedIncome.amount.toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            })}
                          </td>
                        </tr>
                        {selectedIncome.modeOfPayment && (
                          <tr className="border-b">
                            <td className="py-2 font-semibold">Mode of Payment</td>
                            <td className="py-2">{selectedIncome.modeOfPayment}</td>
                          </tr>
                        )}
                        {selectedIncome.chequeNumber && (
                          <tr className="border-b">
                            <td className="py-2 font-semibold">
                              {selectedIncome.modeOfPayment === 'Cheque' ? 'Cheque' : 'Reference'} Number
                            </td>
                            <td className="py-2">{selectedIncome.chequeNumber}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer */}
                  <div className="mt-8 pt-4 border-t border-gray-300">
                    <div className="flex justify-between items-end">
                      {selectedIncome.inputBy && (
                        <div className="text-sm text-gray-600">
                          Entered by: {selectedIncome.inputBy}
                        </div>
                      )}
                      <div className="text-center ml-auto">
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
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
