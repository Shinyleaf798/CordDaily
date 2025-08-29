import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';

// ---- MOCKS ----
jest.mock('../global_function/billsContent', () => {
    // ---- helpers to generate dates in current month / last 7 days ----
function ymd(now = new Date(), offsetDays = 0, time = '12:00:00') {
    const d = new Date(now);
        d.setDate(d.getDate() + offsetDays);
        const Y = d.getFullYear();
        const M = String(d.getMonth() + 1).padStart(2, '0');
        const D = String(d.getDate()).padStart(2, '0');
        return `${Y}-${M}-${D} ${time}`;
    }
    return {
        useBills: () => ({
        // 2 expenses within this month; one within last 7 days
        bills: [
            {
            id: 1,
            subject: 'Groceries',
            category: 'food',
            amount: -100,               // expense
            date: ymd(new Date(), -1),  // yesterday -> in last 7 days
            remark: 'Veg & fruit',
            method: 'Cash'
            },
            {
            id: 2,
            subject: 'Phone Plan',
            category: 'phone',
            amount: -50,                             // expense
            date: ymd(new Date(), -10),             // earlier this month (maybe outside last 7 days)
            remark: '',
            method: 'Card'
            },
            {
            id: 3,
            subject: 'Salary',
            category: 'salary',
            amount: 2000,                            // income (ignored in "Expenditure" sum)
            date: ymd(new Date(), -3),
            remark: '',
            method: 'Bank'
            }
        ],
        loading: false,
        deleteBill: jest.fn(async () => {}),
        syncFromServer: jest.fn(async () => {})
        })
    };
});

jest.mock('../global_function/localStorage', () => ({
  getUser: jest.fn(async () => ({ defaultCurrency: 'RM' }))
}));

// BottomMenu just renders nothing for tests
jest.mock('../global_function/menuButton', () => ({
  BottomMenu: () => null
}));

// ---- import the screen under test (unchanged file) ----
import HomeScreen from '../userScreen/home';

// ---- render helper: Navigation container wrapper ----
function renderWithNav(ui) {
  return render(<NavigationContainer>{ui}</NavigationContainer>);
}

test('renders monthly expenditure total and budget math', async () => {
  const { getByText, queryByText } = renderWithNav(<HomeScreen />);

  // Expenditure total = sum of absolute negative amounts in current month
  // bills: -100 + -50 = 150.00
  await waitFor(() => {
    expect(getByText(/RM 150\.00/)).toBeTruthy(); // top card amount
  });

  // Default monthlyBudget is 500 -> remain = 350.00, overspend = 0.00
  expect(getByText('Budget :')).toBeTruthy();
  expect(getByText(/RM 500\.00/)).toBeTruthy();
  expect(getByText('Remain Budget :')).toBeTruthy();
  expect(getByText(/RM 350\.00/)).toBeTruthy();
  expect(getByText('Overspend :')).toBeTruthy();
  expect(getByText(/RM 0\.00/)).toBeTruthy();

  // Last 7 days header should appear and at least one bill row (“Groceries” is yesterday)
  expect(queryByText('No bills')).toBeNull();
  expect(getByText('Groceries')).toBeTruthy();
});

test('opens action sheet when a bill is tapped, then closes', async () => {
  const { getByText, queryByText } = renderWithNav(<HomeScreen />);

  // Tap the "Groceries" row to open bottom action sheet
  await waitFor(() => expect(getByText('Groceries')).toBeTruthy());
  fireEvent.press(getByText('Groceries'));

  // Action sheet shows "Edit", "Delete", "Cancel"
  await waitFor(() => expect(getByText('Edit')).toBeTruthy());
  expect(getByText('Delete')).toBeTruthy();
  expect(getByText('Cancel')).toBeTruthy();

  // Close it by pressing Cancel
  fireEvent.press(getByText('Cancel'));

  // Sheet should disappear
  await waitFor(() => {
    expect(queryByText('Edit')).toBeNull();
  });
});

test('opens budget panel, saves new budget, updates remain & overspend', async () => {
  render(<NavigationContainer><HomeScreen /></NavigationContainer>);

  // Open the "Set Monthly Budget" panel
  const enterBalance = await screen.findByText('Enter Balance');
  fireEvent.press(enterBalance);

  // Change budget to 100 and save
  const input = await screen.findByPlaceholderText('e.g. 500');
  fireEvent.changeText(input, '100');
  fireEvent.press(screen.getByText('Save'));

  // Expenses total = 150 -> remain = -50, overspend = 50
  await waitFor(() => {
    expect(screen.getByText(/Remain Budget :/)).toBeTruthy();
    expect(screen.getByText(/RM -50\.00/)).toBeTruthy();
    expect(screen.getByText(/Overspend :/)).toBeTruthy();
    expect(screen.getByText(/RM 50\.00/)).toBeTruthy();
  });
});

test('delete flow: tapping Delete shows confirm, tapping Cancel hides it', async () => {
  render(<NavigationContainer><HomeScreen /></NavigationContainer>);

  await waitFor(() => expect(screen.getByText('Groceries')).toBeTruthy());
  fireEvent.press(screen.getByText('Groceries'));

  fireEvent.press(screen.getByText('Delete'));
  await waitFor(() => expect(screen.getByText('Delete this bill?')).toBeTruthy());

  // There are TWO "Cancel" buttons; pick the one from the confirm dialog.
  const cancelButtons = screen.getAllByText('Cancel');
  fireEvent.press(cancelButtons[cancelButtons.length - 1]);

  await waitFor(() => expect(screen.queryByText('Delete this bill?')).toBeNull());
});


