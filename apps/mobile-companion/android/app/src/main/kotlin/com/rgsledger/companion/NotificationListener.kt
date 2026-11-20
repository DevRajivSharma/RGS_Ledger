package com.rgsledger.companion

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.rgsledger.companion.data.DevicePreferences
import com.rgsledger.companion.database.EvidenceDatabase
import com.rgsledger.companion.database.NotificationEntity
import com.rgsledger.companion.parser.EvidenceEligibilityClassifier
import com.rgsledger.companion.parser.NotificationCapture
import com.rgsledger.companion.sync.EvidenceSyncWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Application-agnostic Notification Listener Service.
 * Observes notifications from all applications by default, extracting generic textual
 * and sender metadata, applying on-device eligibility classification, and queuing
 * eligible payment evidence for synchronization.
 */
class NotificationListener : NotificationListenerService() {

    private val scope = CoroutineScope(Dispatchers.IO)
    private lateinit var db: EvidenceDatabase
    private lateinit var prefs: DevicePreferences

    override fun onCreate() {
        super.onCreate()
        db = EvidenceDatabase.getDatabase(applicationContext)
        prefs = DevicePreferences(applicationContext)
        Log.i(TAG, "Application-agnostic RGS NotificationListener created.")
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        isConnected = true
        Log.i(
            PERMISSION_TAG,
            "onListenerConnected: Android system server successfully bound to RGS NotificationListener service."
        )
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        isConnected = false
        Log.w(
            PERMISSION_TAG,
            "onListenerDisconnected: Android system server unbound from RGS NotificationListener service."
        )
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        // 1. Extract generic notification structure
        val captured = NotificationCapture.extract(sbn, packageManager)

        // 2. On-device privacy and eligibility classification
        val eligibility = EvidenceEligibilityClassifier.classify(captured)

        if (!eligibility.isEligible) {
            // Discard immediately — never persist or transmit personal chats, auth OTPs, or non-financial items
            Log.d(TAG, "Discarded non-eligible notification from ${captured.packageName}: ${eligibility.reason}")
            return
        }

        scope.launch {
            // 3. Deduplicate repeat callbacks
            val existing = db.notificationDao().findByHash(captured.contentHash)
            if (existing != null) {
                Log.d(TAG, "Duplicate notification ignored: ${captured.contentHash}")
                return@launch
            }

            // 4. Persist eligible financial evidence locally in encrypted SQLite
            val entity = NotificationEntity(
                contentHash = captured.contentHash,
                packageName = captured.packageName,
                appName = captured.appName,
                title = captured.title,
                text = eligibility.sanitizedText,
                postTime = captured.postTime
            )

            val insertedId = db.notificationDao().insert(entity)
            Log.i(
                TAG,
                "Captured eligible ${eligibility.category} notification ID $insertedId from ${captured.appName} (${captured.packageName})"
            )

            // 5. Trigger resilient background sync worker
            scheduleSync()
        }
    }

    private fun scheduleSync() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val syncRequest = OneTimeWorkRequestBuilder<EvidenceSyncWorker>()
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(applicationContext).enqueue(syncRequest)
    }

    companion object {
        private const val TAG = "RGS_NOTIFICATION_LISTENER"
        const val PERMISSION_TAG = "RGS_PERMISSION"

        @Volatile
        var isConnected: Boolean = false
            internal set
    }
}
