"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ensureDefaultAccounts, getAllFinanceRows, getFinanceCategories, getAllowances } from "@/lib/firebase/finance";
import { getAllProjects } from "@/lib/firebase/projects";
import { getAllEmployees } from "@/lib/firebase/employees";
import { getAllFreelancers } from "@/lib/firebase/freelancers";
import { getAllEvents } from "@/lib/firebase/events";
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
    events: [],
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
      // Load each source independently so one denied/missing collection
      // doesn't blank the whole module, and the toast names what failed.
      const failed = [];
      const safe = (name, promise, fallback) =>
        promise.catch((err) => {
          console.error(`Finance load failed: ${name}`, err);
          failed.push(name);
          return fallback;
        });
      const [accounts, rows, projects, employees, freelancers, events, allowances, loans, payrolls, employeeFinance, advances, cats] =
        await Promise.all([
          safe("accounts", ensureDefaultAccounts(), []),
          safe("transactions", getAllFinanceRows(), { ledger: [], all: [] }),
          safe("projects", getAllProjects(), []),
          safe("employees", getAllEmployees(), []),
          safe("freelancers", getAllFreelancers(), []),
          safe("events", getAllEvents(), []),
          safe("allowances", getAllowances(), []),
          safe("loans", getLoans(), []),
          safe("payrolls", getAllPayrolls(), []),
          safe("employee salaries", getAllEmployeeFinance(), {}),
          safe("employee advances", getEmployeeAdvances(), []),
          safe("categories", getFinanceCategories(), {
            project: DEFAULT_PROJECT_EXPENSE_CATEGORIES,
            company: DEFAULT_COMPANY_EXPENSE_CATEGORIES,
            income: DEFAULT_INCOME_CATEGORIES,
          }),
        ]);
      if (failed.length) toast.error(`Permission denied loading: ${failed.join(", ")}. Check Firestore rules are published.`);
      setState({
        loading: false,
        accounts,
        ledger: rows.ledger,
        all: rows.all,
        projects,
        employees,
        freelancers,
        events,
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

  const balances = useMemo(() => computeBalances(state.accounts, state.all), [state.accounts, state.all]);

  return { ...state, balances, reload };
}
