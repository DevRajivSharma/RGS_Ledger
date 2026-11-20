package com.rgsledger.companion.permission

import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.rgsledger.companion.NotificationListener

/**
 * Authoritative Notification Permission Helper for RGS Ledger Companion.
 * Uses the official Android API 27+ NotificationManager.isNotificationListenerAccessGranted
 * with safe fallback for legacy platforms.
 */
object NotificationPermissionHelper {

    const val TAG = "RGS_PERMISSION"

    /**
     * Authoritative check whether notification listener access has been granted
     * to RGS Ledger Companion's NotificationListener.
     */
    fun isNotificationAccessGranted(context: Context): Boolean {
        return try {
            val componentName = ComponentName(context, NotificationListener::class.java)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                // Authoritative check on Android 8.1+ (API 27 through Android 13/14+)
                val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                val isGranted = notificationManager?.isNotificationListenerAccessGranted(componentName) ?: false

                Log.d(
                    TAG,
                    "API ${Build.VERSION.SDK_INT} authoritative check for ${componentName.flattenToShortString()}: granted=$isGranted"
                )
                isGranted
            } else {
                // Fallback for legacy devices (API < 27)
                checkLegacyPermission(context, componentName)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Unexpected error checking notification listener permission", e)
            throw e
        }
    }

    /**
     * Fallback inspection of Settings.Secure enabled_notification_listeners for API < 27.
     */
    internal fun checkLegacyPermission(context: Context, targetComponent: ComponentName): Boolean {
        val flat = Settings.Secure.getString(
            context.contentResolver,
            "enabled_notification_listeners"
        )
        val isGranted = isPackageOrComponentEnabled(flat, targetComponent.packageName, targetComponent.className)

        Log.d(
            TAG,
            "Legacy check for ${targetComponent.flattenToShortString()}: granted=$isGranted (raw=$flat)"
        )
        return isGranted
    }

    /**
     * Pure parser for enabled_notification_listeners string.
     * Evaluates whether the given package or component is present.
     */
    fun isPackageOrComponentEnabled(flat: String?, targetPackage: String, targetClass: String? = null): Boolean {
        if (flat.isNullOrBlank()) return false
        return flat.split(":").any { entry ->
            val trimmed = entry.trim()
            if (trimmed.isEmpty()) {
                false
            } else if (targetClass != null && (trimmed == "$targetPackage/$targetClass" || trimmed == "$targetPackage/.$targetClass")) {
                true
            } else {
                trimmed.startsWith("$targetPackage/") || trimmed == targetPackage
            }
        }
    }

    /**
     * Creates intent to direct user directly to Android Settings -> Notification Access.
     */
    fun createSettingsIntent(): Intent {
        return Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }
}
