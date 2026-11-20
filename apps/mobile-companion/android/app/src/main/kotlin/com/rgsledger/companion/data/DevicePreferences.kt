package com.rgsledger.companion.data

import android.content.Context
import android.content.SharedPreferences

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
        get() = prefs.getString(KEY_API_URL, "http://10.0.2.2:4000") ?: "http://10.0.2.2:4000"
        set(value) = prefs.edit().putString(KEY_API_URL, value).apply()

    val isPaired: Boolean
        get() = !deviceId.isNullOrBlank() && !deviceToken.isNullOrBlank()

    fun clear() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_DEVICE_TOKEN = "device_token"
        private const val KEY_MERCHANT_ID = "merchant_id"
        private const val KEY_MERCHANT_NAME = "merchant_name"
        private const val KEY_API_URL = "api_base_url"
    }
}
