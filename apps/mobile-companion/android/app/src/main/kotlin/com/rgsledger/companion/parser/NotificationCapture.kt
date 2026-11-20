package com.rgsledger.companion.parser

import android.content.pm.PackageManager
import android.os.Bundle
import android.service.notification.StatusBarNotification
import java.security.MessageDigest

/**
 * Generic captured notification data structure containing raw and normalized metadata.
 */
data class CapturedNotification(
    val packageName: String,
    val appName: String,
    val title: String,
    val text: String,
    val bigText: String?,
    val subText: String?,
    val summaryText: String?,
    val fullText: String,
    val postTime: Long,
    val notificationKey: String,
    val contentHash: String
)

/**
 * Application-agnostic notification extractor.
 * Extracts textual content, sender/title metadata, and handles expanded or multi-line notifications
 * from Google Messages, Samsung Messages, OnePlus Messages, Truecaller, and banking apps.
 */
object NotificationCapture {

    fun extract(sbn: StatusBarNotification, packageManager: PackageManager?): CapturedNotification {
        val packageName = sbn.packageName ?: "unknown.package"
        val postTime = sbn.postTime
        val notificationKey = sbn.key ?: "$packageName:$postTime"

        val extras: Bundle? = sbn.notification?.extras
        val title = extras?.getCharSequence("android.title")?.toString()?.trim() ?: ""
        val text = extras?.getCharSequence("android.text")?.toString()?.trim() ?: ""
        val bigText = extras?.getCharSequence("android.bigText")?.toString()?.trim()
        val subText = extras?.getCharSequence("android.subText")?.toString()?.trim()
        val summaryText = extras?.getCharSequence("android.summaryText")?.toString()?.trim()

        // Extract multi-line inbox styles if present
        val textLines = extras?.getCharSequenceArray("android.textLines")
        val joinedLines = textLines?.joinToString(" ") { it.toString().trim() }

        // Assemble full textual content, prioritizing expanded bigText over truncated preview
        val fullText = when {
            !bigText.isNullOrBlank() -> bigText
            !joinedLines.isNullOrBlank() -> joinedLines
            text.isNotBlank() -> text
            else -> title
        }

        // Resolve human-readable application label (e.g. "Messages", "Truecaller", "Vyom")
        val appName = try {
            if (packageManager != null) {
                val appInfo = packageManager.getApplicationInfo(packageName, 0)
                packageManager.getApplicationLabel(appInfo).toString()
            } else {
                packageName
            }
        } catch (_: Exception) {
            packageName
        }

        // Compute stable content hash for deduplication (independent of volatile OS postTime)
        val contentHash = computeContentHash(packageName, title, fullText)

        return CapturedNotification(
            packageName = packageName,
            appName = appName,
            title = title,
            text = text,
            bigText = bigText,
            subText = subText,
            summaryText = summaryText,
            fullText = fullText,
            postTime = postTime,
            notificationKey = notificationKey,
            contentHash = contentHash
        )
    }

    private fun computeContentHash(packageName: String, title: String, text: String): String {
        val input = "$packageName:${title.trim()}:${text.trim()}"
        val bytes = MessageDigest.getInstance("SHA-256").digest(input.toByteArray())
        return bytes.joinToString("") { "%02x".format(it) }
    }
}
