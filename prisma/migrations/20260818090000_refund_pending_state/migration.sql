-- DARTSOPEN-MONETIZATION-004 (P1, contre-audit)

-- AlterEnum: RegistrationStatus — new REFUND_PENDING value: a refund has been decided/requested
-- but not yet financially confirmed. REFUNDED (already existed) is redefined to mean strictly
-- "confirmed by SterPlatform" — dbConfirmPendingPayment() now transitions PENDING ->
-- REFUND_PENDING first, and only dbMarkRefundConfirmed() (called after a genuine confirmation
-- from SterPlatform, synchronous or via the payment.refunded webhook) moves it to REFUNDED.
ALTER TYPE "RegistrationStatus" ADD VALUE 'REFUND_PENDING';
