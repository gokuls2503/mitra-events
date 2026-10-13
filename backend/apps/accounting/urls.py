from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.include_root_view = False
router.register("accounts/tax-rates", views.TaxRateViewSet, basename="tax-rate")
router.register("accounts/groups", views.AccountGroupViewSet, basename="account-group")
router.register("accounts/ledgers", views.LedgerViewSet, basename="ledger")
router.register("accounts/quotations", views.QuotationViewSet, basename="quotation")
router.register("accounts/invoices", views.InvoiceViewSet, basename="invoice")
router.register("accounts/receipts", views.ReceiptViewSet, basename="receipt")
router.register("accounts/expenses", views.ExpenseViewSet, basename="expense")
router.register("accounts/vouchers", views.VoucherViewSet, basename="voucher")

urlpatterns = [
    path("accounts/settings/", views.CompanySettingsView.as_view(), name="accounts-settings"),
    path("accounts/reports/<slug:name>/", views.ReportView.as_view(), name="accounts-report"),
    path("accounts/bookings/<int:pk>/summary/", views.BookingFinanceView.as_view(), name="booking-finance"),
    *router.urls,
]
