"use client";
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { getCurrentYearString } from "../utils/constants";

interface FinancialYearContextType {
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  availableYears: string[];
  setAvailableYears: (years: string[]) => void;
}

const FinancialYearContext = createContext<FinancialYearContextType>({
  selectedYear: getCurrentYearString(),
  setSelectedYear: () => {},
  availableYears: [],
  setAvailableYears: () => {},
});

const STORAGE_KEY = "abs_selected_financial_year";

export function FinancialYearProvider({ children }: { children: ReactNode }) {
  const [selectedYear, setSelectedYearState] = useState<string>(getCurrentYearString());
  const [availableYears, setAvailableYears] = useState<string[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSelectedYearState(stored);
      }
    } catch (e) {
      console.error("Error reading financial year from localStorage:", e);
    }
  }, []);

  const setSelectedYear = useCallback((year: string) => {
    setSelectedYearState(year);
    try {
      localStorage.setItem(STORAGE_KEY, year);
    } catch (e) {
      console.error("Error saving financial year to localStorage:", e);
    }
  }, []);

  return (
    <FinancialYearContext.Provider value={{ selectedYear, setSelectedYear, availableYears, setAvailableYears }}>
      {children}
    </FinancialYearContext.Provider>
  );
}

export function useFinancialYear() {
  return useContext(FinancialYearContext);
}