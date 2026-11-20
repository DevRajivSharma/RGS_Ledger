package com.rgsledger.companion.parser

import java.util.regex.Pattern
import java.text.SimpleDateFormat
import java.util.TimeZone
import java.util.Locale

data class ParsedUnionBankEvidence(
    val bank: String = "Union Bank of India",
    val accountSuffix: String,
    val transactionType: String,
    val amountPaise: Long,
    val transactionDate: String,
    val transactionTime: String,
    val reference: String,
    val rawText: String,
    val isoTimestamp: String,
    val utcTimestamp: String
)

object UnionBankParser {
    // Regex matching the exact Union Bank merchant notification format:
    // A/c *0562 Credited for Rs:1.00 on 13-11-2026 18:25:24 by Mob Bk ref no 668387168541 Avl Bal Rs:1090.03.Never Share OTP/PIN/CVV-Union Bank of India
    private val PATTERN = Pattern.compile(
        "A/c\\s*[*X]*([0-9]+)\\s+(Credited|Debited)\\s+for\\s+Rs:?([0-9,.]+)\\s+on\\s+([0-9-]+)\\s+([0-9:]+)\\s+by.*ref\\s+no\\s+([0-9a-zA-Z]+)",
        Pattern.CASE_INSENSITIVE
    )

    fun parse(text: String): ParsedUnionBankEvidence? {
        val matcher = PATTERN.matcher(text)
        if (!matcher.find()) return null

        val suffix = matcher.group(1) ?: return null
        val type = if (matcher.group(2)?.equals("Debited", ignoreCase = true) == true) "DEBIT" else "CREDIT"
        val amountStr = matcher.group(3)?.replace(",", "") ?: return null
        val amountPaise = (amountStr.toDoubleOrNull()?.times(100))?.toLong() ?: return null
        val date = matcher.group(4) ?: return null
        val time = matcher.group(5) ?: return null
        val ref = matcher.group(6) ?: return null

        // Convert Indian local time (DD-MM-YYYY HH:mm:ss IST) to ISO with +05:30 and UTC (Z)
        val dateParts = date.split("-")
        val isoTimestamp = if (dateParts.size == 3) {
            "${dateParts[2]}-${dateParts[1]}-${dateParts[0]}T${time}+05:30"
        } else {
            "${date}T${time}+05:30"
        }

        val istFormat = SimpleDateFormat("dd-MM-yyyy HH:mm:ss", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("Asia/Kolkata")
        }
        val utcFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }

        val utcTimestamp = try {
            val parsedDate = istFormat.parse("$date $time")
            if (parsedDate != null) utcFormat.format(parsedDate) else isoTimestamp
        } catch (_: Exception) {
            isoTimestamp
        }

        return ParsedUnionBankEvidence(
            bank = "Union Bank of India",
            accountSuffix = suffix,
            transactionType = type,
            amountPaise = amountPaise,
            transactionDate = date,
            transactionTime = time,
            reference = ref,
            rawText = text,
            isoTimestamp = isoTimestamp,
            utcTimestamp = utcTimestamp
        )
    }
}
