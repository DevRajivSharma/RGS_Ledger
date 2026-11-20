package com.rgsledger.companion.parser

enum class NotificationCategory {
    CREDIT_CANDIDATE,
    DEBIT_ALERT,
    DISCARDED_PERSONAL,
    DISCARDED_AUTH_OTP,
    DISCARDED_EMPTY
}

data class EligibilityResult(
    val isEligible: Boolean,
    val category: NotificationCategory,
    val sanitizedText: String,
    val reason: String
)

/**
 * On-device Privacy and Eligibility Classifier.
 * Evaluates notifications locally before inserting into local storage or sending over the wire.
 * Strictly filters out personal chats, non-financial alerts, and authentication OTPs.
 */
object EvidenceEligibilityClassifier {

    private val CREDIT_REGEX = Regex(
        "(?i)\\b(credited|received|deposited|refund|transferred\\s+to\\s+your|added\\s+to\\s+your|credited\\s+for)\\b"
    )

    private val DEBIT_REGEX = Regex(
        "(?i)\\b(debited|spent|paid\\s+to|withdrawn|transferred\\s+from)\\b"
    )

    private val FINANCIAL_INDICATOR_REGEX = Regex(
        "(?i)(?:INR|Rs\\.?|₹|amount|amt|avl\\s*bal|a/c|acct|account|ref\\s*(?:no)?|rrn|utr|upi)"
    )

    private val PURE_OTP_AUTH_REGEX = Regex(
        "(?i)\\b(?:otp|one\\s*time\\s*password|login\\s*pin|verification\\s*code|security\\s*code|cvv)\\b"
    )

    private val SENSITIVE_REDACTION_PATTERNS = listOf(
        Regex("(?i)\\b(?:otp|pin|cvv|password)\\s*[:=]?\\s*([0-9a-zA-Z]{4,8})\\b"),
        Regex("(?i)\\b(?:never\\s*share|do\\s*not\\s*share)\\s+(?:otp|pin|cvv)[^.]*"),
        Regex("(?i)\\b(?:valid\\s+for|expires\\s+in)\\s+[0-9]+\\s*(?:mins|minutes|secs|seconds)")
    )

    /**
     * Classifies a captured notification for payment evidence eligibility.
     */
    fun classify(notification: CapturedNotification): EligibilityResult {
        val combined = "${notification.title} ${notification.fullText}".trim()
        if (combined.isBlank()) {
            return EligibilityResult(
                isEligible = false,
                category = NotificationCategory.DISCARDED_EMPTY,
                sanitizedText = "",
                reason = "EMPTY_NOTIFICATION_DISCARDED"
            )
        }

        val hasCredit = CREDIT_REGEX.containsMatchIn(combined)
        val hasDebit = DEBIT_REGEX.containsMatchIn(combined)
        val hasFinancialCues = FINANCIAL_INDICATOR_REGEX.containsMatchIn(combined)
        val hasOtpAuth = PURE_OTP_AUTH_REGEX.containsMatchIn(combined)

        // 1. Pure OTP / Login verification messages without credit context are discarded immediately
        if (hasOtpAuth && !hasCredit) {
            return EligibilityResult(
                isEligible = false,
                category = NotificationCategory.DISCARDED_AUTH_OTP,
                sanitizedText = "[CONFIDENTIAL_AUTH_DISCARDED]",
                reason = "PURE_AUTH_OTP_DISCARDED"
            )
        }

        // 2. Personal chat or non-financial notifications (e.g. WhatsApp, Messenger, social, delivery)
        if (!hasFinancialCues || (!hasCredit && !hasDebit)) {
            return EligibilityResult(
                isEligible = false,
                category = NotificationCategory.DISCARDED_PERSONAL,
                sanitizedText = "",
                reason = "NON_FINANCIAL_NOTIFICATION_DISCARDED"
            )
        }

        // 3. Redact any sensitive PIN/OTP sequences before storing or submitting
        val sanitized = sanitizeText(notification.fullText)

        // 4. Classify transaction direction
        if (hasDebit && !hasCredit) {
            return EligibilityResult(
                isEligible = true,
                category = NotificationCategory.DEBIT_ALERT,
                sanitizedText = sanitized,
                reason = "ELIGIBLE_DEBIT_ALERT"
            )
        }

        return EligibilityResult(
            isEligible = true,
            category = NotificationCategory.CREDIT_CANDIDATE,
            sanitizedText = sanitized,
            reason = "ELIGIBLE_CREDIT_CANDIDATE"
        )
    }

    /**
     * Redacts confidential OTPs, PINs, passwords from text.
     */
    fun sanitizeText(text: String): String {
        var sanitized = text
        for (pattern in SENSITIVE_REDACTION_PATTERNS) {
            sanitized = sanitized.replace(pattern, "[CONFIDENTIAL_REDACTED]")
        }
        return sanitized
    }
}
