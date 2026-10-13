import { lazy, Suspense, type ComponentType } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AuthProvider } from '@/shared/auth/AuthContext'
import { RequireAuth } from '@/shared/auth/RequireAuth'
import { FullPageSpinner } from '@/shared/ui/Spinner'

import { AdminLayout } from './layout/AdminLayout'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const DashboardHome = lazy(() => import('./pages/DashboardHome'))
const UsersPage = lazy(() => import('./settings/UsersPage'))
const ProfilePage = lazy(() => import('./settings/ProfilePage'))
const WebsiteLayout = lazy(() => import('./website/WebsiteLayout'))
const SettingsTab = lazy(() => import('./website/SettingsTab'))
const ServicesTab = lazy(() => import('./website/ServicesTab'))
const PackagesTab = lazy(() => import('./website/PackagesTab'))
const TestimonialsTab = lazy(() => import('./website/TestimonialsTab'))
const EstimatorTab = lazy(() => import('./website/EstimatorTab'))
const CrmLayout = lazy(() => import('./crm/CrmLayout'))
const LeadsPage = lazy(() => import('./crm/LeadsPage'))
const LeadDetailPage = lazy(() => import('./crm/LeadDetailPage'))
const FollowUpsPage = lazy(() => import('./crm/FollowUpsPage'))
const ClientsPage = lazy(() => import('./crm/ClientsPage'))
const ClientDetailPage = lazy(() => import('./crm/ClientDetailPage'))
const EventsPage = lazy(() => import('./events/EventsPage'))
const BookingDetailPage = lazy(() => import('./events/BookingDetailPage'))
const OpsLayout = lazy(() => import('./ops/OpsLayout'))
const TasksPage = lazy(() => import('./ops/TasksPage'))
const VendorsPage = lazy(() => import('./ops/VendorsPage'))
const MaterialsPage = lazy(() => import('./materials/MaterialsPage'))
const GalleryPage = lazy(() => import('./gallery/GalleryPage'))
const AccountsLayout = lazy(() => import('./accounts/AccountsLayout'))
const AnalyticsPage = lazy(() => import('./analytics/AnalyticsPage'))
// Lazy-load one named export from an accounts module.
function named<M>(loader: () => Promise<M>, key: keyof M) {
  return lazy(() => loader().then((m) => ({ default: m[key] as ComponentType })))
}
const sales = () => import('./accounts/SalesDocs')
const A = {
  Invoices: named(sales, 'InvoicesPage'),
  Invoice: named(sales, 'InvoiceViewPage'),
  NewInvoice: named(sales, 'NewInvoicePage'),
  EditInvoice: named(sales, 'EditInvoicePage'),
  Quotations: named(sales, 'QuotationsPage'),
  Quotation: named(sales, 'QuotationViewPage'),
  NewQuotation: named(sales, 'NewQuotationPage'),
  EditQuotation: named(sales, 'EditQuotationPage'),
  Receipts: named(() => import('./accounts/Receipts'), 'ReceiptsPage'),
  Expenses: named(() => import('./accounts/Expenses'), 'ExpensesPage'),
  Ledgers: named(() => import('./accounts/Ledgers'), 'LedgersPage'),
  Ledger: named(() => import('./accounts/Ledgers'), 'LedgerStatementPage'),
  Vouchers: named(() => import('./accounts/Vouchers'), 'VouchersPage'),
  Reports: named(() => import('./accounts/Reports'), 'ReportsPage'),
  Settings: named(() => import('./accounts/Settings'), 'SettingsPage'),
}

/** Everything under /admin. Auth state only exists inside the admin, never on the public site. */
export default function AdminApp() {
  return (
    <AuthProvider>
      <Suspense fallback={<FullPageSpinner />}>
        <Routes>
          <Route path="login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AdminLayout />
              </RequireAuth>
            }
          >
            <Route index element={<DashboardHome />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route
              path="users"
              element={
                <RequireAuth roles={['OWNER']}>
                  <UsersPage />
                </RequireAuth>
              }
            />
            <Route
              path="website"
              element={
                <RequireAuth roles={['OWNER', 'MANAGER']}>
                  <WebsiteLayout />
                </RequireAuth>
              }
            >
              <Route index element={<Navigate to="settings" replace />} />
              <Route path="settings" element={<SettingsTab />} />
              <Route path="services" element={<ServicesTab />} />
              <Route path="packages" element={<PackagesTab />} />
              <Route path="testimonials" element={<TestimonialsTab />} />
              <Route path="estimator" element={<EstimatorTab />} />
            </Route>
            <Route path="crm" element={<CrmLayout />}>
              <Route index element={<Navigate to="leads" replace />} />
              <Route path="leads" element={<LeadsPage />} />
              <Route path="leads/:id" element={<LeadDetailPage />} />
              <Route path="follow-ups" element={<FollowUpsPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="clients/:id" element={<ClientDetailPage />} />
            </Route>
            <Route
              path="materials"
              element={
                <RequireAuth roles={['OWNER', 'MANAGER']}>
                  <MaterialsPage />
                </RequireAuth>
              }
            />
            <Route
              path="gallery"
              element={
                <RequireAuth roles={['OWNER', 'MANAGER']}>
                  <GalleryPage />
                </RequireAuth>
              }
            />
            <Route path="events" element={<EventsPage />} />
            <Route path="events/:id" element={<BookingDetailPage />} />
            <Route path="operations" element={<OpsLayout />}>
              <Route index element={<Navigate to="tasks" replace />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="vendors" element={<VendorsPage />} />
            </Route>
            <Route
              path="accounts"
              element={
                <RequireAuth roles={['OWNER', 'MANAGER', 'ACCOUNTANT']}>
                  <AccountsLayout />
                </RequireAuth>
              }
            >
              <Route index element={<Navigate to="invoices" replace />} />
              <Route path="invoices" element={<A.Invoices />} />
              <Route path="invoices/new" element={<A.NewInvoice />} />
              <Route path="invoices/:id" element={<A.Invoice />} />
              <Route path="invoices/:id/edit" element={<A.EditInvoice />} />
              <Route path="quotations" element={<A.Quotations />} />
              <Route path="quotations/new" element={<A.NewQuotation />} />
              <Route path="quotations/:id" element={<A.Quotation />} />
              <Route path="quotations/:id/edit" element={<A.EditQuotation />} />
              <Route path="receipts" element={<A.Receipts />} />
              <Route path="expenses" element={<A.Expenses />} />
              <Route path="ledgers" element={<A.Ledgers />} />
              <Route path="ledgers/:id" element={<A.Ledger />} />
              <Route path="vouchers" element={<A.Vouchers />} />
              <Route
                path="reports"
                element={
                  <RequireAuth roles={['OWNER', 'ACCOUNTANT']}>
                    <A.Reports />
                  </RequireAuth>
                }
              />
              <Route path="settings" element={<A.Settings />} />
            </Route>
            <Route
              path="analytics"
              element={
                <RequireAuth roles={['OWNER', 'MANAGER', 'ACCOUNTANT']}>
                  <AnalyticsPage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<p className="text-stone-600">Page not found.</p>} />
          </Route>
        </Routes>
      </Suspense>
    </AuthProvider>
  )
}
