// test/login.test.js
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

// Silence RN Animated helper noise
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper', () => ({}), { virtual: true });

/* ----------------------- Mocks & shared fakes ----------------------- */

// Navigation mock (name starts with mock* so it's allowed in factories)
const mockNav = { reset: jest.fn(), navigate: jest.fn() };
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => mockNav,
  };
});

// convertAPI
const mockApiFetch = jest.fn();
const mockEnsureRatesUpToDate = jest.fn(async () => {});
jest.mock('../global_function/convertAPI', () => ({
  apiFetch: (...a) => mockApiFetch(...a),
  ensureRatesUpToDate: (...a) => mockEnsureRatesUpToDate(...a),
}));

// localStorage
const mockSaveToken = jest.fn(async () => {});
const mockSaveUser  = jest.fn(async () => {});
jest.mock('../global_function/localStorage', () => ({
  saveToken: (...a) => mockSaveToken(...a),
  saveUser:  (...a) => mockSaveUser(...a),
}));

// useBills
const mockSyncFromServer = jest.fn(async () => {});
jest.mock('../global_function/billsContent', () => ({
  useBills: () => ({ syncFromServer: mockSyncFromServer }),
}));

// Spy Alert.alert
jest.spyOn(Alert, 'alert').mockImplementation(() => {});

import LoginScreen from '../userScreen/login';

/* ------------------------------ Helpers ------------------------------ */

const pressLoginButton = () => {
  // header title + button both say "Login"; pick the button (usually rendered after title)
  const all = screen.getAllByText('Login');
  fireEvent.press(all[all.length - 1]);
};

const typeLogin = async (email, password) => {
  fireEvent.changeText(screen.getByPlaceholderText('Enter email'), email);
  fireEvent.changeText(screen.getByPlaceholderText('Enter password'), password);
  pressLoginButton();
};

/* -------------------------------- Tests ------------------------------ */

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockResolvedValue({
    success: true,
    token: 'tkn-123',
    user: { id: 7, name: 'Deston', defaultCurrency: 'MYR' },
  });
});

test('renders fields and buttons', () => {
  render(<LoginScreen />);
  // both header title and button exist
  const loginTexts = screen.getAllByText('Login');
  expect(loginTexts.length).toBeGreaterThanOrEqual(2);

  expect(screen.getByPlaceholderText('Enter email')).toBeTruthy();
  expect(screen.getByPlaceholderText('Enter password')).toBeTruthy();
  expect(screen.getByText('No account? Register')).toBeTruthy();
});

test('successful login: saves token+user, ensures rates, syncs, and navigates Home', async () => {
  render(<LoginScreen />);

  await typeLogin('user@example.com', 'secret');

  await waitFor(() => {
    expect(mockApiFetch).toHaveBeenCalledWith('/login.php', expect.objectContaining({
      method: 'POST',
      debug: true,
      body: expect.any(String),
    }));
  });

  // verify trimmed email in request body
  const [, options] = mockApiFetch.mock.calls[0];
  const body = JSON.parse(options.body);
  expect(body.email).toBe('user@example.com');
  expect(body.password).toBe('secret');

  await waitFor(() => {
    expect(mockSaveToken).toHaveBeenCalledWith('tkn-123');
    expect(mockSaveUser).toHaveBeenCalledWith({ id: 7, name: 'Deston', defaultCurrency: 'MYR' });
    expect(mockEnsureRatesUpToDate).toHaveBeenCalledWith('MYR');
    expect(mockSyncFromServer).toHaveBeenCalled();
    expect(mockNav.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Home' }] });
  });

  expect(Alert.alert).not.toHaveBeenCalled();
});

test('backend failure: shows alert with server message and does not navigate', async () => {
  mockApiFetch.mockResolvedValueOnce({ success: false, message: 'Password incorrect' });
  render(<LoginScreen />);

  await typeLogin('u@e.com', 'badpass');

  await waitFor(() => {
    expect(Alert.alert).toHaveBeenCalledWith('Login Failed', 'Password incorrect');
  });

  expect(mockSaveToken).not.toHaveBeenCalled();
  expect(mockSaveUser).not.toHaveBeenCalled();
  expect(mockEnsureRatesUpToDate).not.toHaveBeenCalled();
  expect(mockSyncFromServer).not.toHaveBeenCalled();
  expect(mockNav.reset).not.toHaveBeenCalled();
});

test('malformed response (missing user/token): shows alert and stops', async () => {
  mockApiFetch.mockResolvedValueOnce({ success: true, token: null, user: null });
  render(<LoginScreen />);

  await typeLogin('u@e.com', 'x');

  await waitFor(() => {
    expect(Alert.alert).toHaveBeenCalledWith('Login Failed', 'Malformed server response.');
  });

  expect(mockSaveToken).not.toHaveBeenCalled();
  expect(mockSaveUser).not.toHaveBeenCalled();
  expect(mockNav.reset).not.toHaveBeenCalled();
});

test('exception during login: shows alert with error', async () => {
  mockApiFetch.mockRejectedValueOnce(new Error('Network down'));
  render(<LoginScreen />);

  await typeLogin('u@e.com', 'x');

  await waitFor(() => {
    expect(Alert.alert).toHaveBeenCalledWith('Login Failed', 'Network down');
  });

  expect(mockSaveToken).not.toHaveBeenCalled();
  expect(mockSaveUser).not.toHaveBeenCalled();
  expect(mockNav.reset).not.toHaveBeenCalled();
});

test('link to Signup navigates to Signup screen', async () => {
  render(<LoginScreen />);
  fireEvent.press(screen.getByText('No account? Register'));
  expect(mockNav.navigate).toHaveBeenCalledWith('Signup');
});
