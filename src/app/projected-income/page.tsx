"use client";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useEffect, useState } from "react";
import { getUserDoc } from "../../utils/getUserDoc";
import { useRouter } from "next/navigation";
import { db } from "../../firebase/config";
import { ref, get, set } from "firebase/database";
import { logAudit } from "../../utils/auditLog";
import { dbPath, ROUTES, hasAccess, INCOME_CATEGORIES } from "../../utils/constants";
import { useFinancialYear } from "../../context/FinancialYearContext";

interface CategoryActual {
  projected: number;
  actual: number;
}

export default function ProjectedIncomePage() {
  const { user } = useAuth();
  const { selectedYear } = useFinancialYear();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projectedAmounts, setProjectedAmounts] = useState<Record<string, string>>({});
  const [categoryActuals, setCategoryActuals] = useState<Record<string, CategoryActual>>({});
  const [showSuccess, setShowSuccess] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid)
        .then((data) => {
          setUserData(data);
        })
        .finally(() => setLoading(false));
    }
  }, [user]);

  // Load projected amounts and compute actuals
  useEffect(() => {
    if (userData) {
      loadData();
    }
  }, [userData]);

  const loadData = async () => {
    try {
      setLoading(true);
      const currentYear = selectedYear;

      // Load projected amounts
      const projectedRef = ref(db, dbPath.projectedIncome(currentYear));
      const projectedSnapshot = await get(projectedRef);

      const amounts: Record<string, string> = {};
      if (projectedSnapshot.exists()) {
        const projectedData = projectedSnapshot.val();
        INCOME_CATEGORIES.forEach((cat) => {
          amounts[cat.value] = projectedData[cat.value]?.toString() || "";
        });
      } else {
        INCOME_CATEGORIES.forEach((cat) => {
          amounts[cat.value] = "";
        });
      }
      setProjectedAmounts(amounts);

      // Compute actuals from Income records
      const incomeRef = ref(db, dbPath.income(currentYear));
      const incomeSnapshot = await get(incomeRef);

      const actualByCategory: Record<string, number> = {};
      INCOME_CATEGORIES.forEach((cat) => { actualByCategory[cat.value] = 0; });

      if (incomeSnapshot.exists()) {
        const incomeData = incomeSnapshot.val();
        Object.values(incomeData).forEach((record: any) => {
          const cat = record.category;
          const amt = record.amount ? (typeof record.amount === 'string' ? parseFloat(record.amount) : record.amount) : 0;
          if (actualByCategory[cat] !== undefined) {
            actualByCategory[cat] = Math.round((actualByCategory[cat] + amt) * 100) / 100;
          }
        });
      }

      // Build category actuals map
      const actuals: Record<string, CategoryActual> = {};
      INCOME_CATEGORIES.forEach((cat) => {
        const projectedVal = amounts[cat.value] ? parseFloat(amounts[cat.value]) : 0;
        actuals[cat.value] = {
          projected: isNaN(projectedVal) ? 0 : projectedVal,
          actual: actualByCategory[cat.value] || 0,
        };
      });
      setCategoryActuals(actuals);
    } catch (error) {
      console.error("Error loading projected income data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAmountChange = (category: string, value: string) => {
    setProjectedAmounts((prev) => ({ ...prev, [category]: value }));
  };

  const handleSave = async () => {
    if (!userData || !user) return;
    try {
      setSaving(true);
      const currentYear = selectedYear;
      const projectedRef = ref(db, dbPath.projectedIncome(currentYear));

      // Build projected data object
      const projectedData: Record<string, number> = {};
      INCOME_CATEGORIES.forEach((cat) => {
        const val = projectedAmounts[cat.value];
        projectedData[cat.value] = val ? Math.round(parseFloat(val) * 100) / 100 : 0;
      });

      // Save to database
      await set(projectedRef, projectedData);

      // Log audit
      await logAudit({
        action: "UPDATE",
        entityType: "ProjectedIncome",
        entityId: currentYear,
        previousData: null,
        newData: projectedData,
        changedBy: userData.name || user.email || "Unknown",
        changedByUid: user.uid || "",
        changedAt: new Date().toISOString(),
      });

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);

      // Reload to update actuals display
      loadData();
    } catch (error) {
      console.error("Error saving projected income:", error);
      alert("Error saving projected income. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const canAccess = userData && hasAccess(userData.userType);

  // Calculate totals
  const totalProjected = Object.values(categoryActuals).reduce((sum, cat) => sum + cat.projected, 0);
  const totalActual = Object.values(categoryActuals).reduce((sum, cat) => sum + cat.actual, 0);

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
              onClick={() => router.push(ROUTES.DASHBOARD)}
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
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-center mb-6">
            <button
              onClick={() => router.push(ROUTES.DASHBOARD)}
              className="mr-4 text-blue-600 hover:text-blue-800"
            >
              ← Back to Dashboard
            </button>
            <h1 className="text-3xl font-bold text-gray-800">Projected Income</h1>
          </div>

          {/* Description */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-blue-800 text-sm">
              Set projected (budgeted) income amounts for each category. Actual figures are automatically computed from recorded income entries.
            </p>
          </div>

          {/* Success Message */}
          {showSuccess && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md mb-6">
              Projected income saved successfully!
            </div>
          )}

          {/* Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Projected Amount (₹)
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actual (₹)
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Variance (₹)
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      %
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {INCOME_CATEGORIES.map((cat) => {
                    const actual = categoryActuals[cat.value];
                    const projectedVal = actual?.projected || 0;
                    const actualVal = actual?.actual || 0;
                    const variance = projectedVal - actualVal;
                    const percentage = projectedVal > 0 ? Math.round((actualVal / projectedVal) * 100) : 0;
                    const isOverTarget = actualVal > projectedVal && projectedVal > 0;
                    const isUnderTarget = actualVal < projectedVal && projectedVal > 0;

                    return (
                      <tr key={cat.value} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {cat.label}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <input
                            type="number"
                            value={projectedAmounts[cat.value] || ""}
                            onChange={(e) => handleAmountChange(cat.value, e.target.value)}
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                            className="w-40 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-right text-sm"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-green-600">
                          ₹ {actualVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-medium ${
                          variance >= 0 ? 'text-blue-600' : 'text-orange-600'
                        }`}>
                          {variance >= 0 ? '+' : ''}₹ {variance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          {projectedVal > 0 ? (
                            <div className="inline-flex items-center gap-1">
                              <div className="w-16 bg-gray-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full ${
                                    percentage >= 100 ? 'bg-green-500' : percentage >= 75 ? 'bg-yellow-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${Math.min(percentage, 100)}%` }}
                                />
                              </div>
                              <span className={`text-xs font-medium ${
                                percentage >= 100 ? 'text-green-600' : percentage >= 75 ? 'text-yellow-600' : 'text-red-600'
                              }`}>
                                {percentage}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                      Total
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-gray-900">
                      ₹ {totalProjected.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-green-600">
                      ₹ {totalActual.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-bold ${
                      totalProjected - totalActual >= 0 ? 'text-blue-600' : 'text-orange-600'
                    }`}>
                      {(totalProjected - totalActual) >= 0 ? '+' : ''}₹ {(totalProjected - totalActual).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-gray-900">
                      {totalProjected > 0 ? `${Math.round((totalActual / totalProjected) * 100)}%` : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Save Button */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 text-white px-8 py-3 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Projected Income"}
            </button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}