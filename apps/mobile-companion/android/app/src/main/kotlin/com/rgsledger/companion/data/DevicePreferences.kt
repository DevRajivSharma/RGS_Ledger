package com.rgsledger.companion.data

import android.content.Context
import android.content.SharedPreferences
import com.rgsledger.companion.BuildConfig

class DevicePreferences(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("rgs_device_prefs", Context.MODE_PRIVATE)

    var deviceId: String?
        get() = prefs.getString(KEY_DEVICE_ID, null)
        set(value) = prefs.edit().putString(KEY_DEVICE_ID, value).apply()

    var deviceToken: String?
        get() = prefs.getString(KEY_DEVICE_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_DEVICE_TOKEN, value).apply()

    var merchantId: String?
        get() = prefs.getString(KEY_MERCHANT_ID, null)
        set(value) = prefs.edit().putString(KEY_MERCHANT_ID, value).apply()

    var merchantName: String?
        get() = prefs.getString(KEY_MERCHANT_NAME, null)
        set(value) = prefs.edit().putString(KEY_MERCHANT_NAME, value).apply()

    var apiBaseUrl: String
        get() {
            val stored = prefs.getString(KEY_API_URL, null)?.trim()?.trimEnd('/')
            if (stored.isNullOrBlank()) {
                return BuildConfig.DEFAULT_API_URL
            }
            // In release builds, guard against stale local development IPs persisted from previous installs
            if (!BuildConfig.DEBUG && isLocalOrPrivateUrl(stored)) {
                return BuildConfig.DEFAULT_API_URL
            }
            return stored
        }
        set(value) {
            val cleanValue = value.trim().trimEnd('/')
            prefs.edit().putString(KEY_API_URL, cleanValue).apply()
        }

    val isPaired: Boolean
        get() = !deviceId.isNullOrBlank() && !deviceToken.isNullOrBlank()

    fun clear() {
        prefs.edit().clear().apply()
    }

    companion object {
        const val PRODUCTION_API_URL = "https://api.rgsledger.rajivsharma.online"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_DEVICE_TOKEN = "device_token"
        private const val KEY_MERCHANT_ID = "merchant_id"
        private const val KEY_MERCHANT_NAME = "merchant_name"
        private const val KEY_API_URL = "api_base_url"

        fun isLocalOrPrivateUrl(url: String): Boolean {
            val lower = url.lowercase()
            return lower.contains("localhost") ||
                    lower.contains("127.0.0.1") ||
                    lower.contains("10.0.2.2") ||
                    lower.contains("10.") ||
                    lower.contains("192.168.")
        }
    }
}
