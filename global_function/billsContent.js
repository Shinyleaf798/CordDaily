import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiFetch, ensureRatesUpToDate, normalizeRates } from './convertAPI';
import { getUser, loadBills, saveBills, saveCurrencyRates } from './localStorage';

const BillsCtx = createContext(null);

export function BillsProvider({ children }){
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const cached = await loadBills();
      setBills(cached);
      setLoading(false);
      // Refresh from server & currency
      syncFromServer();
    })();
  }, []);

  const syncFromServer = useCallback(async () => {
    try {
      const user = await getUser();
      if (!user?.id) {
        console.warn("syncFromServer: no logged-in user found in storage");
        return;
      }
      // Make sure API cache fresh
      const apiJson = await ensureRatesUpToDate("USD");
      const normalized = normalizeRates(apiJson, user.defaultCurrency || "USD");
      await saveCurrencyRates(normalized);   // overwrite with normalized table

      // Make sure FX rates are fresh for the user’s default currency (fallback USD)
      const base = (user?.defaultCurrency || 'USD').toUpperCase();
      await ensureRatesUpToDate(base);

      // Data sync
      const data = await apiFetch(`/bills.php?userID=${encodeURIComponent(user.id)}`, { method: 'GET' });
      const next = Array.isArray(data?.bills) ? data.bills : [];
      setBills(next);
      await saveBills(next);
    } catch (e) {
      console.error("syncFromServer error:", e);
    }
  }, []);

  // When user create new bill call this
  const addBill = useCallback(async (payload) => {
    const res = await apiFetch('/addBills.php', { method: 'POST', body: JSON.stringify(payload) });
    if (res?.bill) {
      setBills(prev => {
        const next = [res.bill, ...prev];
        saveBills(next);
        return next;
      });
      return res;
    }
    await syncFromServer();
    return res;
  }, [syncFromServer]);

  // When user edit bill call this
  const editBill = useCallback(async (billsID, patch) => {
    const res = await apiFetch('/editBill.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billsID, ...patch }),
    });

    // log the whole response once to see shape if things go wrong
    //console.log('editBill response:', res);

    const serverBill = res?.bill;  
    if (!serverBill) {
      console.warn('No bill returned from server; falling back to local merge.');
    }

    setBills(prev => {
      const normId = v => (v?.id ?? v?.billsID);
      const next = prev.map(b => {
        if (normId(b) !== billsID) return b;
        return serverBill ? serverBill : { ...b, ...patch, billsID, id: b.id ?? billsID };
      });
      saveBills(next);
      return next;
    });
  }, [apiFetch, saveBills]);

  // When user want to delete bill call this
  const deleteBill = useCallback(async (billsID) => {
    // tell PHP we're sending JSON
    const res = await apiFetch('/deleteBill.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billsID })
    });

    // check server ack
    if (res?.ok === false) {
      console.warn('Delete failed on server:', res?.error);
      return;
    }

    // remove from local list (handle id OR billsID)
    setBills(prev => {
      const norm = v => (v?.id ?? v?.billsID);
      const next = prev.filter(b => norm(b) !== billsID);
      saveBills(next);
      return next;
    });
  }, [apiFetch, saveBills]);


  const value = { bills, loading, syncFromServer, addBill, editBill, deleteBill };
  return <BillsCtx.Provider value={value}>{children}</BillsCtx.Provider>;
}

export const useBills = () => useContext(BillsCtx);
