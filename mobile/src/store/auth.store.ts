import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  baseCurrency: string;
};

type AuthState = {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setSession: (session: { user: AuthUser; accessToken: string; refreshToken: string }) => Promise<void>;
  setAccessToken: (accessToken: string) => Promise<void>;
  clearSession: () => Promise<void>;
};

const KEYS = { accessToken: 'accessToken', refreshToken: 'refreshToken', user: 'user' };

// token 存 expo-secure-store（CLAUDE.md 技术栈约定），不是 AsyncStorage——后者不加密，不适合存 token
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isHydrated: false,

  // 读取失败（钥匙串还没初始化、权限问题等）也要把 isHydrated 置 true，
  // 否则根布局的 `if (!isHydrated) return null` 会让 App 卡在空白页出不去，等于永久卡死在启动屏
  hydrate: async () => {
    try {
      const [accessToken, refreshToken, userJson] = await Promise.all([
        SecureStore.getItemAsync(KEYS.accessToken),
        SecureStore.getItemAsync(KEYS.refreshToken),
        SecureStore.getItemAsync(KEYS.user),
      ]);
      set({
        accessToken,
        refreshToken,
        user: userJson ? (JSON.parse(userJson) as AuthUser) : null,
        isHydrated: true,
      });
    } catch (err) {
      console.warn('Failed to hydrate auth session, falling back to logged out', err);
      set({ accessToken: null, refreshToken: null, user: null, isHydrated: true });
    }
  },

  setSession: async ({ user, accessToken, refreshToken }) => {
    await Promise.all([
      SecureStore.setItemAsync(KEYS.accessToken, accessToken),
      SecureStore.setItemAsync(KEYS.refreshToken, refreshToken),
      SecureStore.setItemAsync(KEYS.user, JSON.stringify(user)),
    ]);
    set({ user, accessToken, refreshToken });
  },

  setAccessToken: async (accessToken) => {
    await SecureStore.setItemAsync(KEYS.accessToken, accessToken);
    set({ accessToken });
  },

  clearSession: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.accessToken),
      SecureStore.deleteItemAsync(KEYS.refreshToken),
      SecureStore.deleteItemAsync(KEYS.user),
    ]);
    set({ user: null, accessToken: null, refreshToken: null });
  },
}));
