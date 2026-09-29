"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ensureDefaultAccounts, getAllFinanceRows, getFinanceCategories, getAllowances } from "@/lib/firebase/finance";
import { getAllProjects } from "@/lib/firebase/projects";
import { getAllEmployees } from "@/lib/firebase/employees";
import { getAllFreelancers } from "@/lib/firebase/freelancers";
import { getLoans } from "@/lib/firebase/loans";
import { getAllPayrolls, getAllEmployeeFinance, getEmployeeAdvances } from "@/lib/firebase/payroll";
import { computeBalances } from "./calc";
import {
  DEFAULT_PROJECT_EXPENSE_CATEGORIES,
  DEFAULT_COMPANY_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
} from "./constants";

/**
 * One loader for the whole Finance module. Every screen reads the same
 * ledger, so a transaction entered anywhere shows up everywhere after
 * `reload()` — that is what keeps the screens "connected".
 *
 * `ledger`  = financeTransactions only (editable rows).
 * `all`     = ledger + legacy invoices/expenses (use this for any P&L/report).
 */
export default function useFinanceData() {
  const [state, setState] = useState({
    loading: true,
    accounts: [],
    ledger: [],
    all: [],
    projects: [],
    employees: [],
    freelancers: [],
    allowances: [],
    loans: [],
    payrolls: [],
    employeeFinance: {},
    advances: [],
    cats: {
      project: DEFAULT_PROJECT_EXPENSE_CATEGORIES,
      company: DEFAULT_COMPANY_EXPENSE_CATEGORIES,
      income: DEFAULT_INCOME_CATEGORIES,
    },
  });

  const reload = useCallback(async () => {
    try {
      const [accounts, rows, projects, employees, freelancers, allowances, loans, payrolls, employeeFinance, advances, cats] =
        await Promise.all([
          ensureDefaultAccounts(),
          getAllFinanceRows(),
          getAllProjects(),
          getAllEmployees(),
          getAllFreelancers(),
          getAllowances(),
          getLoans(),
          getAllPayrolls(),
          getAllEmployeeFinance(),
          getEmployeeAdvances(),
          getFinanceCategories(),
        ]);
      setState({
        loading: false,
        accounts,
        ledger: rows.ledger,
        all: rows.all,
        projects,
        employees,
        freelancers,
        allowances,
        loans,
        payrolls,
        employeeFinance,
        advances,
        cats,
      });
    } catch (err) {
      console.error("Finance load failed:", err);
      toast.error("Could not load finance data");
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  const balances = useMemo(() => computeBalances(state.accounts, state.ledger), [state.accounts, state.ledger]);

  return { ...state, balances, reload };
}
