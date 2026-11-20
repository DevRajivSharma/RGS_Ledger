package com.rgsledger.companion.parser

import java.security.MessageDigest

object NotificationFilter {
    // Known messaging, SMS, and banking applications for reference and diagnostics
    val KNOWN_MESSAGING_PACKAGES = setOf(
        "com.google.android.apps.messaging", // Google Messages
        "com.samsung.android.messaging",     // Samsung Messages
        "com.oneplus.mms",                   // OnePlus Messages
        "com.coloros.mms",                   // OPPO / Realme Messages
        "com.heytap.mms",                    // HeyTap Messages
        "com.truecaller",                    // Truecaller SMS
        "com.android.mms"                    // AOSP / Generic Stock SMS
    )

    val KNOWN_BANKING_PACKAGES = setOf(
        "com.infrasofttech.uboi",            // Union Bank of India (Vyom)
        "com.google.android.apps.nbu.paisa.user", // Google Pay
        "com.phonepe.app",                   // PhonePe
        "net.one97.paytm",                   // Paytm
        "in.org.npci.upiapp",                // BHIM
        "com.snapwork.hdfc",                 // HDFC Bank MobileBanking
        "com.msf.kbank.mobile",              // Kotak 811
        "com.csam.icici.bank.imobile",       // ICICI iMobile
        "com.sbi.lotusintouch"               // YONO SBI
    )

    /**
     * Checks if notification text contains transactional cues (delegates to EvidenceEligibilityClassifier).
     */
    fun shouldProcess(packageName: String, title: String, text: String): Boolean {
        val captured = CapturedNotification(
            packageName = packageName,
            appName = packageName,
            title = title,
            text = text,
            bigText = null,
            subText = null,
            summaryText = null,
            fullText = "$title $text",
            postTime = System.currentTimeMillis(),
            notificationKey = "$packageName:${System.currentTimeMillis()}",
            contentHash = computeContentHash(packageName, System.currentTimeMillis(), "$title $text")
        )
        return EvidenceEligibilityClassifier.classify(captured).isEligible
    }

    /**
     * Redacts confidential PINs, OTPs, CVVs from notification text.
     */
    fun sanitizeText(text: String): String {
        return EvidenceEligibilityClassifier.sanitizeText(text)
    }

    /**
     * Computes deterministic SHA-256 content fingerprint for deduplication.
     */
    fun computeContentHash(packageName: String, postTime: Long, text: String): String {
        val input = "$packageName:$postTime:$text"
        val bytes = MessageDigest.getInstance("SHA-256").digest(input.toByteArray())
        return bytes.joinToString("") { "%02x".format(it) }
    }
}
