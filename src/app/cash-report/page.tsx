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

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

interface CashTillEntry {
  name: string;
  balance: number;
  lastUpdated: string;
}

interface CashTransaction {
  key: string;
  date: string;
  amount: number;
  transactionType: "CashIn" | "CashOut";
  cashPersonName: string;
  sourceEntity: string;
  sourceReference: string;
  inputBy: string;
  createdAt: string;
  description?: string;
}

export default function CashReportPage() {
  const { user } = useAuth();
  const { selectedYear } = useFinancialYear();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cashTillData, setCashTillData] = useState<Record<string, CashTillEntry>>({});
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<CashTransaction[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<string>("all");
  const [totalCashIn, setTotalCashIn] = useState(0);
  const [totalCashOut, setTotalCashOut] = useState(0);
  const [netCash, setNetCash] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid).then((data) => {
        setUserData(data);
      }).finally(() => setLoading(false));
    }
  }, [user]);

  useEffect(() => {
    if (userData && selectedYear) {
      fetchCashData();
    }
  }, [userData, selectedYear]);

  const fetchCashData = async () => {
    try {
      // Fetch cash till balances
      const cashTillRef = ref(db, dbPath.cashTill(selectedYear));
      const tillSnapshot = await get(cashTillRef);
      if (tillSnapshot.exists()) {
        setCashTillData(tillSnapshot.val());
      }

      // Fetch all cash transactions
      const transactionsRef = ref(db, dbPath.cashTransactions(selectedYear));
      const txSnapshot = await get(transactionsRef);
      if (txSnapshot.exists()) {
        const txList: CashTransaction[] = [];
        let cashInTotal = 0;
        let cashOutTotal = 0;

        txSnapshot.forEach((childSnapshot) => {
          const tx = childSnapshot.val() as CashTransaction;
          txList.push(tx);
          if (tx.transactionType === "CashIn") {
            cashInTotal = roundMoney(cashInTotal + (tx.amount || 0));
          } else {
            cashOutTotal = roundMoney(cashOutTotal + (tx.amount || 0));
          }
        });

        // Sort by date descending (newest first)
        txList.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        setTransactions(txList);
        setFilteredTransactions(txList);
        setTotalCashIn(cashInTotal);
        setTotalCashOut(cashOutTotal);
        setNetCash(roundMoney(cashInTotal - cashOutTotal));
      }
    } catch (error) {
      console.error("Error fetching cash data:", error);
    }
  };

  const handlePersonFilter = (person: string) => {
    setSelectedPerson(person);
    if (person === "all") {
      setFilteredTransactions(transactions);
    } else {
      setFilteredTransactions(transactions.filter((tx) => tx.cashPersonName === person));
    }
  };

  const getPersonBalance = (personName: string): number => {
    const entry = cashTillData[personName];
    return entry ? entry.balance || 0 : 0;
  };

  const getPersonTotalCashIn = (personName: string): number => {
    return transactions
      .filter((tx) => tx.cashPersonName === personName && tx.transactionType === "CashIn")
      .reduce((sum, tx) => roundMoney(sum + (tx.amount || 0)), 0);
  };

  const getPersonTotalCashOut = (personName: string): number => {
    return transactions
      .filter((tx) => tx.cashPersonName === personName && tx.transactionType === "CashOut")
      .reduce((sum, tx) => roundMoney(sum + (tx.amount || 0)), 0);
  };

  const personNames = Object.keys(cashTillData).sort();

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div>Loading...</div>
        </div>
      </ProtectedRoute>
    );
  }

  const canAccess = userData && hasAccess(userData.userType);
  if (!canAccess) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 py-8 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
              <p className="font-medium">Access Denied</p>
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
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <button onClick={() => router.push(ROUTES.DASHBOARD)} className="mr-4 text-blue-600 hover:text-blue-800">← Back to Dashboard</button>
              <h1 className="text-3xl font-bold">Cash Management Report</h1>
            </div>
            <button
              onClick={() => router.push(ROUTES.CASH_TRANSFER_TRACKER)}
              className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Transfer Cash
            </button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-700 font-medium">Total Cash Received (Cash In)</p>
              <p className="text-2xl font-bold text-green-600">₹ {totalCashIn.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700 font-medium">Total Cash Paid (Cash Out)</p>
              <p className="text-2xl font-bold text-red-600">₹ {totalCashOut.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className={`border rounded-lg p-4 ${netCash >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
              <p className={`text-sm font-medium ${netCash >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>Net Cash Balance</p>
              <p className={`text-2xl font-bold ${netCash >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>₹ {netCash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>

          {/* Cash Till Summary by Person */}
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">Cash Till Summary (By Person)</h2>
            </div>
            <div className="p-5">
              {personNames.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No cash transactions recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Person Name</th>
                        <th className="text-right px-4 py-2 font-medium text-gray-600">Total Cash In</th>
                        <th className="text-right px-4 py-2 font-medium text-gray-600">Total Cash Out</th>
                        <th className="text-right px-4 py-2 font-medium text-gray-600">Current Balance</th>
                        <th className="text-center px-4 py-2 font-medium text-gray-600">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {personNames.map((person) => {
                        const personCashIn = getPersonTotalCashIn(person);
                        const personCashOut = getPersonTotalCashOut(person);
                        const balance = getPersonBalance(person);
                        return (
                          <tr key={person} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium text-gray-800">{person}</td>
                            <td className="px-4 py-2 text-right text-green-600">₹ {personCashIn.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-2 text-right text-red-600">₹ {personCashOut.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className={`px-4 py-2 text-right font-semibold ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>₹ {balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-2 text-center">
                              <button
                                onClick={() => handlePersonFilter(person)}
                                className={`text-xs px-3 py-1 rounded-full font-medium ${selectedPerson === person ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                              >
                                {selectedPerson === person ? 'Showing' : 'Filter'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {selectedPerson !== "all" && (
                        <tr className="border-t border-gray-200 bg-blue-50">
                          <td colSpan={5} className="px-4 py-2 text-center">
                            <button
                              onClick={() => handlePersonFilter("all")}
                              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                            >
                              ← Show All Transactions
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Transaction Details */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">
                Cash Transactions {selectedPerson !== "all" && <span className="text-blue-600">- {selectedPerson}</span>}
              </h2>
              <button
                onClick={fetchCashData}
                className="text-sm bg-gray-200 text-gray-700 px-3 py-1 rounded-md hover:bg-gray-300"
              >
                Refresh
              </button>
            </div>
            <div className="p-5">
              {filteredTransactions.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No transactions found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Person</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-600">Type</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">Amount</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Source</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Reference</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Input By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.map((tx) => (
                        <tr key={tx.key} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-700">{tx.date}</td>
                          <td className="px-3 py-2 font-medium text-gray-800">{tx.cashPersonName}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                              tx.transactionType === "CashIn"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}>
                              {tx.transactionType === "CashIn" ? "IN" : "OUT"}
                            </span>
                          </td>
                          <td className={`px-3 py-2 text-right font-medium ${
                            tx.transactionType === "CashIn" ? "text-green-600" : "text-red-600"
                          }`}>
                            ₹ {(tx.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-2 text-gray-700">{tx.sourceEntity}</td>
                          <td className="px-3 py-2 text-gray-700">{tx.sourceReference || "-"}</td>
                          <td className="px-3 py-2 text-gray-700">{tx.inputBy || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}