"use client";
import { useEffect, useState } from "react";
import { db } from "../firebase/config";
import { ref, get } from "firebase/database";
import { DB_PATHS, YEAR_KEY_REGEX, formatFinancialYear, getCurrentYearString } from "../utils/constants";
import { useFinancialYear } from "../context/FinancialYearContext";

export default function FinancialYearSelector() {
  const { selectedYear, setSelectedYear, availableYears, setAvailableYears } = useFinancialYear();
  const [yearsLoading, setYearsLoading] = useState(true);

  // Discover available financial years from the database
  useEffect(() => {
    const discoverYears = async () => {
      try {
        setYearsLoading(true);
        const snapshot = await get(ref(db, DB_PATHS.ROOT));
        if (snapshot.exists()) {
          const data = snapshot.val();
          const years = Object.keys(data)
            .filter(key => YEAR_KEY_REGEX.test(key))
            .sort((a, b) => parseInt(b) - parseInt(a));
          setAvailableYears(years);
        }
      } catch (err) {
        console.error("Error discovering years:", err);
      } finally {
        setYearsLoading(false);
      }
    };
    discoverYears();
  }, [setAvailableYears]);

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedYear(e.target.value);
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="fy-select" className="text-sm font-medium text-gray-700 whitespace-nowrap">
        Financial Year:
      </label>
      <select
        id="fy-select"
        value={selectedYear}
        onChange={handleYearChange}
        disabled={yearsLoading}
        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-1.5 px-3 border bg-white"
      >
        {yearsLoading ? (
          <option value={selectedYear}>Loading...</option>
        ) : (
          availableYears.map((year) => (
            <option key={year} value={year}>
              {formatFinancialYear(year)}
            </option>
          ))
        )}
      </select>
    </div>
  );
}