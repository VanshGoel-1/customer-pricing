/**
 * Cashbook page tests.
 *
 * Covers:
 *  - Summary cards render with mocked API data
 *  - "Add Transaction" button opens modal
 *  - Submitting the modal calls the create API and refreshes the list
 *  - Balance card shows correct arithmetic (total_in - total_out)
 *  - Type filter passes correct param to API
 *  - Role-based delete button visibility
 *  - Empty state and error state
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as cashbookApi from '../api/cashbook'
import { AuthContext } from '../context/AuthContext'
import Cashbook from '../pages/Cashbook'

// ── Helpers ──────────────────────────────────────────────────────────────────

const SUMMARY = {
  balance: '300.00',
  total_in: '500.00',
  total_out: '200.00',
  cash_in_hand: '150.00',
}

const TODAY = new Date().toISOString().slice(0, 10)

const TRANSACTIONS = [
  {
    id: 1,
    transaction_type: 'IN',
    amount: '500.00',
    category: 'sale',
    mode: 'cash',
    description: 'Morning sales',
    transaction_date: TODAY,
    order_number: null,
  },
  {
    id: 2,
    transaction_type: 'OUT',
    amount: '200.00',
    category: 'expense',
    mode: 'online',
    description: 'Monthly rent',
    transaction_date: TODAY,
    order_number: null,
  },
]

function mockAuth(role = 'admin') {
  return {
    user: { id: 1, name: 'Test User', email: 'test@example.com', role },
    isAdmin: role === 'admin',
    isManager: role === 'admin' || role === 'manager',
    isCashier: role === 'cashier',
  }
}

function renderCashbook(role = 'admin') {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={mockAuth(role)}>
        <Cashbook />
      </AuthContext.Provider>
    </MemoryRouter>
  )
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.spyOn(cashbookApi, 'getCashbookSummary').mockResolvedValue({
    data: { data: SUMMARY },
  })
  vi.spyOn(cashbookApi, 'getCashTransactions').mockResolvedValue({
    data: { results: TRANSACTIONS, count: TRANSACTIONS.length },
  })
  vi.spyOn(cashbookApi, 'createCashInTransaction').mockResolvedValue({ data: {} })
  vi.spyOn(cashbookApi, 'createCashOutTransaction').mockResolvedValue({ data: {} })
  vi.spyOn(cashbookApi, 'deleteCashTransaction').mockResolvedValue({})
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Cashbook page', () => {
  it('renders summary cards with mocked API data', async () => {
    renderCashbook()

    await waitFor(() => {
      expect(screen.getByText('Total Balance')).toBeInTheDocument()
      expect(screen.getByText('Cash in Hand')).toBeInTheDocument()
      expect(screen.getByText("Today's In")).toBeInTheDocument()
      expect(screen.getByText("Today's Out")).toBeInTheDocument()
    })

    expect(screen.getByText('₹300.00')).toBeInTheDocument()
    expect(screen.getByText('₹150.00')).toBeInTheDocument()
  })

  it("today's in/out cards show correct arithmetic from today's transactions", async () => {
    renderCashbook()

    await waitFor(() => screen.getByText('Morning sales'))

    const cards = screen.getAllByText(/₹\d/)
    const values = cards.map((el) => el.textContent)
    expect(values).toContain('₹500.00')
    expect(values).toContain('₹200.00')
  })

  it('renders transaction rows', async () => {
    renderCashbook()

    await waitFor(() => {
      expect(screen.getByText('Morning sales')).toBeInTheDocument()
      expect(screen.getByText('Monthly rent')).toBeInTheDocument()
    })

    expect(screen.getByText('Sale')).toBeInTheDocument()
    expect(screen.getByText('Expense')).toBeInTheDocument()
  })

  it('"Add Transaction" button opens the modal', async () => {
    renderCashbook()

    await waitFor(() => screen.getByText('Morning sales'))

    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }))

    // Modal is open when the header and amount placeholder are visible
    expect(screen.getByText('Add Transaction')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument()
  })

  it('submitting the modal calls create API and refreshes list', async () => {
    renderCashbook()
    await waitFor(() => screen.getByText('Morning sales'))

    // Open modal
    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }))

    // Fill amount field (identified by placeholder since labels have no htmlFor)
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '100' } })

    // Target the category select by its placeholder option text
    const categorySelect = screen.getByDisplayValue('Select category…')
    fireEvent.change(categorySelect, { target: { value: 'sale' } })

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /add income/i }))

    await waitFor(() => {
      expect(cashbookApi.createCashInTransaction).toHaveBeenCalledTimes(1)
      expect(cashbookApi.getCashTransactions).toHaveBeenCalledTimes(2)
    })
  })

  it('type filter passes correct param to API', async () => {
    renderCashbook()
    await waitFor(() => screen.getByText('Morning sales'))

    fireEvent.change(screen.getByDisplayValue('All Types'), { target: { value: 'OUT' } })

    await waitFor(() => {
      const calls = cashbookApi.getCashTransactions.mock.calls
      const lastCall = calls[calls.length - 1][0]
      expect(lastCall.transaction_type).toBe('OUT')
    })
  })

  it('shows "Clear filters" when a filter is active and clears on click', async () => {
    renderCashbook()
    await waitFor(() => screen.getByText('Morning sales'))

    fireEvent.change(screen.getByDisplayValue('All Types'), { target: { value: 'IN' } })
    await waitFor(() => screen.getByText('Clear filters'))

    fireEvent.click(screen.getByText('Clear filters'))
    await waitFor(() => {
      expect(screen.queryByText('Clear filters')).not.toBeInTheDocument()
    })
  })

  it('delete button calls delete API and refreshes (manager role)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderCashbook('manager')

    await waitFor(() => screen.getByText('Morning sales'))

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(cashbookApi.deleteCashTransaction).toHaveBeenCalledWith(1)
      expect(cashbookApi.getCashTransactions).toHaveBeenCalledTimes(2)
    })
  })

  it('cashier role does not see delete buttons', async () => {
    renderCashbook('cashier')

    await waitFor(() => screen.getByText('Morning sales'))

    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })

  it('shows empty state when no transactions', async () => {
    cashbookApi.getCashTransactions.mockResolvedValue({
      data: { results: [], count: 0 },
    })

    renderCashbook()

    await waitFor(() => {
      expect(screen.getByText('No transactions yet')).toBeInTheDocument()
    })
  })

  it('shows error state when API fails', async () => {
    cashbookApi.getCashTransactions.mockRejectedValue(new Error('Network error'))

    renderCashbook()

    await waitFor(() => {
      expect(screen.getByText('Failed to load cashbook data.')).toBeInTheDocument()
    })
  })
})
