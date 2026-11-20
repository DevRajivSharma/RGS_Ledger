package com.rgsledger.companion.sync

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.gson.Gson
import com.rgsledger.companion.data.DevicePreferences
import com.rgsledger.companion.database.EvidenceDatabase
import com.rgsledger.companion.database.NotificationEntity
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class EvidenceSyncWorker(
    context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    private val db = EvidenceDatabase.getDatabase(context)
    private val prefs = DevicePreferences(context)
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()
    private val gson = Gson()

    override suspend fun doWork(): Result {
        if (!prefs.isPaired) {
            Log.w(TAG, "Device not paired. Skipping sync.")
            return Result.success()
        }

        val pending = db.notificationDao().getPendingNotifications()
        if (pending.isEmpty()) {
            return Result.success()
        }

        Log.d(TAG, "Syncing ${pending.size} pending notifications...")

        var hadFailures = false
        for (item in pending) {
            try {
                val success = uploadNotification(item)
                if (success) {
                    db.notificationDao().updateStatus(item.id, "SYNCED")
                } else {
                    hadFailures = true
                    db.notificationDao().updateStatus(item.id, "FAILED", "Upload rejected by API")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to upload notification ${item.id}", e)
                hadFailures = true
                db.notificationDao().updateStatus(item.id, "FAILED", e.message)
            }
        }

        // Prune synced notifications older than 7 days to maintain clean local storage
        try {
            val sevenDaysAgo = System.currentTimeMillis() - (7L * 24 * 60 * 60 * 1000)
            db.notificationDao().pruneSyncedNotifications(sevenDaysAgo)
        } catch (_: Exception) {}

        return if (hadFailures) Result.retry() else Result.success()
    }

    private fun uploadNotification(entity: NotificationEntity): Boolean {
        val payload = mapOf(
            "providerMessageId" to "android_${entity.packageName}_${entity.contentHash}",
            "packageName" to entity.packageName,
            "appName" to entity.appName,
            "notificationTitle" to entity.title,
            "notificationText" to entity.text,
            "postTime" to entity.postTime,
            "rawPayloadHash" to entity.contentHash
        )

        val jsonBody = gson.toJson(payload)
        val requestBody = jsonBody.toRequestBody("application/json".toMediaType())

        val request = Request.Builder()
            .url("${prefs.apiBaseUrl.trimEnd('/')}/api/v1/devices/evidence")
            .header("Authorization", "Bearer ${prefs.deviceToken}")
            .post(requestBody)
            .build()

        client.newCall(request).execute().use { response ->
            return response.isSuccessful
        }
    }

    companion object {
        private const val TAG = "RGS_EVIDENCE_SYNC"
    }
}
