import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const TOKEN_KEY = 'auth_token';
export const BILLS_KEY = 'bills_cache';
export const USER_KEY  = 'user_profile';

// currency cache keys
export const CURRENCY_RATES_KEY = 'currency_rates_json';          // whole API response
export const CURRENCY_UPDATED_DATE_KEY = 'currency_updated_utc';   // 'YYYY-MM-DD' from time_last_update_utc

// token
export const saveToken = (t) => SecureStore.setItemAsync(TOKEN_KEY, String(t));
export const getToken  = () => SecureStore.getItemAsync(TOKEN_KEY);
export const clearToken= () => SecureStore.deleteItemAsync(TOKEN_KEY);

// bills
export const saveBills = (bills=[]) => AsyncStorage.setItem(BILLS_KEY, JSON.stringify(bills));
export const loadBills = async () => {
  const s = await AsyncStorage.getItem(BILLS_KEY);
  return s ? JSON.parse(s) : [];
};

// user
export const saveUser = (user={}) => AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
export const getUser = async () => {
  const s = await AsyncStorage.getItem(USER_KEY);
  return s ? JSON.parse(s) : null;
};
export const clearUser = () => AsyncStorage.removeItem(USER_KEY);

// currency cache helpers
export const saveCurrencyRates = (obj={}) =>
  AsyncStorage.setItem(CURRENCY_RATES_KEY, JSON.stringify(obj));

export const getCurrencyRates = async () => {
  const s = await AsyncStorage.getItem(CURRENCY_RATES_KEY);
  return s ? JSON.parse(s) : null;
};

export const saveCurrencyUpdatedDate = (yyyyMmDd) =>
  AsyncStorage.setItem(CURRENCY_UPDATED_DATE_KEY, String(yyyyMmDd));

export const getCurrencyUpdatedDate = () =>
  AsyncStorage.getItem(CURRENCY_UPDATED_DATE_KEY);

export const clearCurrencyCache = async () => {
  await AsyncStorage.removeItem(CURRENCY_RATES_KEY);
  await AsyncStorage.removeItem(CURRENCY_UPDATED_DATE_KEY);
};

export const clearAll = async () => {
  try {
    await clearToken();
    await clearUser();
    await saveBills([]);      // clear bills cache
    await clearCurrencyCache();
  } catch (e) {
    console.error("Failed to clear local storage:", e);
  }
};