package com.rgsledger.companion

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputFilter
import android.text.InputType
import android.util.Log
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.rgsledger.companion.data.DevicePreferences
import com.rgsledger.companion.database.EvidenceDatabase
import com.rgsledger.companion.database.NotificationEntity
import com.rgsledger.companion.parser.CapturedNotification
import com.rgsledger.companion.parser.EvidenceEligibilityClassifier
import com.rgsledger.companion.parser.NotificationCapture
import com.rgsledger.companion.permission.NotificationPermissionHelper
import com.rgsledger.companion.sync.EvidenceSyncWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

/**
 * Main Activity for RGS Ledger Companion.
 * Implements authoritative permission detection, lifecycle auto-refresh,
 * device pairing, and companion dashboard states.
 */
class MainActivity : Activity() {

    enum class UiState {
        CHECKING,
        PERMISSION_NOT_GRANTED,
        PERMISSION_GRANTED_UNPAIRED,
        PERMISSION_GRANTED_PAIRED,
        ERROR
    }

    private val scope = CoroutineScope(Dispatchers.Main)
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()
    private val gson = Gson()

    private lateinit var prefs: DevicePreferences
    private lateinit var db: EvidenceDatabase
    private lateinit var rootContainer: LinearLayout
    private lateinit var scrollView: ScrollView

    private var currentState: UiState = UiState.CHECKING
    private var lastErrorMessage: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = DevicePreferences(applicationContext)
        db = EvidenceDatabase.getDatabase(applicationContext)

        scrollView = ScrollView(this).apply {
            setBackgroundColor(Color.parseColor("#0F172A"))
            isFillViewport = true
        }

        rootContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 48, 48, 48)
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
        }

        scrollView.addView(rootContainer)
        setContentView(scrollView)

        Log.i(NotificationPermissionHelper.TAG, "MainActivity onCreate: Initial evaluation")
        evaluateAndRenderState()
    }

    override fun onResume() {
        super.onResume()
        Log.d(
            NotificationPermissionHelper.TAG,
            "MainActivity onResume: App gained focus. Re-checking permission and lifecycle state."
        )
        evaluateAndRenderState()
    }

    /**
     * Authoritatively checks permission and navigates to the appropriate screen state.
     */
    fun evaluateAndRenderState() {
        val newState = try {
            val isGranted = NotificationPermissionHelper.isNotificationAccessGranted(this)
            Log.d(
                NotificationPermissionHelper.TAG,
                "Permission check result: isGranted=$isGranted, listenerConnected=${NotificationListener.isConnected}, isPaired=${prefs.isPaired}"
            )

            if (!isGranted) {
                UiState.PERMISSION_NOT_GRANTED
            } else if (!prefs.isPaired) {
                UiState.PERMISSION_GRANTED_UNPAIRED
            } else {
                UiState.PERMISSION_GRANTED_PAIRED
            }
        } catch (e: Exception) {
            Log.e(NotificationPermissionHelper.TAG, "Evaluation failed with exception", e)
            lastErrorMessage = e.message ?: "Unknown error while checking notification access"
            UiState.ERROR
        }

        if (newState != currentState || rootContainer.childCount == 0) {
            Log.i(
                NotificationPermissionHelper.TAG,
                "Navigation transition: $currentState -> $newState"
            )
            currentState = newState
            renderCurrentState()
        } else {
            // Refresh stats or connected badge if staying in paired state
            if (currentState == UiState.PERMISSION_GRANTED_PAIRED) {
                refreshPairedStats()
            }
        }
    }

    private fun renderCurrentState() {
        rootContainer.removeAllViews()

        // 1. Header (Common across all states)
        renderHeader()

        // 2. Render state-specific screen
        when (currentState) {
            UiState.CHECKING -> renderCheckingView()
            UiState.PERMISSION_NOT_GRANTED -> renderPermissionRequiredView()
            UiState.PERMISSION_GRANTED_UNPAIRED -> renderPairingView()
            UiState.PERMISSION_GRANTED_PAIRED -> renderDashboardView()
            UiState.ERROR -> renderErrorView()
        }
    }

    private fun renderHeader() {
        val title = TextView(this).apply {
            text = "RGS Ledger Companion"
            textSize = 22f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(0, 16, 0, 8)
        }
        rootContainer.addView(title)

        val subtitle = TextView(this).apply {
            text = "UPI Payment Evidence Companion"
            textSize = 13f
            setTextColor(Color.parseColor("#94A3B8"))
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 32)
        }
        rootContainer.addView(subtitle)
    }

    // -------------------------------------------------------------------------
    // STATE 1: Checking
    // -------------------------------------------------------------------------
    private fun renderCheckingView() {
        val progressBar = ProgressBar(this).apply {
            setPadding(0, 48, 0, 48)
        }
        rootContainer.addView(progressBar)

        val checkingText = TextView(this).apply {
            text = "Checking system notification access..."
            setTextColor(Color.parseColor("#94A3B8"))
            gravity = Gravity.CENTER
        }
        rootContainer.addView(checkingText)
    }

    // -------------------------------------------------------------------------
    // STATE 2: Permission Required
    // -------------------------------------------------------------------------
    private fun renderPermissionRequiredView() {
        val card = createCardLayout()

        val badge = createBadge("NOTIFICATION ACCESS REQUIRED", "#F59E0B", "#78350F")
        card.addView(badge)

        val desc = TextView(this).apply {
            text = "RGS Ledger Companion requires Notification Access to automatically capture incoming UPI credit notifications from your bank and messaging apps.\n\n" +
                    "• Money is credited directly to your bank account.\n" +
                    "• Only credit notifications are processed.\n" +
                    "• Personal messages, OTPs, and private data are discarded on-device."
            textSize = 14f
            setTextColor(Color.parseColor("#E2E8F0"))
            setLineSpacing(6f, 1f)
            setPadding(0, 24, 0, 32)
        }
        card.addView(desc)

        val grantButton = Button(this).apply {
            text = "Grant Notification Access in Settings"
            setBackgroundColor(Color.parseColor("#2563EB"))
            setTextColor(Color.WHITE)
            typeface = Typeface.DEFAULT_BOLD
            setPadding(32, 28, 32, 28)
            setOnClickListener {
                Log.i(NotificationPermissionHelper.TAG, "User clicked Grant Notification Access -> Opening Settings")
                startActivity(NotificationPermissionHelper.createSettingsIntent())
            }
        }
        card.addView(grantButton)

        val recheckButton = Button(this).apply {
            text = "Check Again"
            setBackgroundColor(Color.parseColor("#334155"))
            setTextColor(Color.parseColor("#CBD5E1"))
            setPadding(24, 20, 24, 20)
            setOnClickListener {
                Log.i(NotificationPermissionHelper.TAG, "User clicked Check Again manually")
                evaluateAndRenderState()
            }
        }
        val params = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            topMargin = 20
        }
        card.addView(recheckButton, params)

        rootContainer.addView(card)
    }

    // -------------------------------------------------------------------------
    // STATE 3: Permission Granted, Not Paired
    // -------------------------------------------------------------------------
    private fun renderPairingView() {
        // Status Card
        val statusCard = createCardLayout()
        val permBadge = createBadge("Notification Access: GRANTED", "#22C55E", "#14532D")
        statusCard.addView(permBadge)

        val listenerStatus = if (NotificationListener.isConnected) {
            createBadge("Service: CONNECTED", "#22C55E", "#14532D")
        } else {
            createBadge("Service: STANDBY (Ready for system bind)", "#F59E0B", "#78350F")
        }
        val badgeParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = 12 }
        statusCard.addView(listenerStatus, badgeParams)
        rootContainer.addView(statusCard)

        // Pairing Form Card
        val formCard = createCardLayout()
        val formTitle = TextView(this).apply {
            text = "Pair Device with Merchant Account"
            textSize = 17f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            setPadding(0, 0, 0, 8)
        }
        formCard.addView(formTitle)

        val formSubtitle = TextView(this).apply {
            text = "Enter the 8-character pairing code from the Merchant Dashboard (Devices tab)."
            textSize = 13f
            setTextColor(Color.parseColor("#94A3B8"))
            setPadding(0, 0, 0, 24)
        }
        formCard.addView(formSubtitle)

        // Pairing Code Input
        val codeLabel = createInputLabel("PAIRING CODE (8 CHARACTERS)")
        formCard.addView(codeLabel)
        val codeInput = EditText(this).apply {
            hint = "e.g. ABCD1234"
            setHintTextColor(Color.parseColor("#64748B"))
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#1E293B"))
            setPadding(28, 24, 28, 24)
            filters = arrayOf(InputFilter.AllCaps(), InputFilter.LengthFilter(8))
        }
        formCard.addView(codeInput)

        // Device Name Input
        val nameLabel = createInputLabel("DEVICE NAME")
        formCard.addView(nameLabel)
        val nameInput = EditText(this).apply {
            setText("OnePlus Nord CE 2 - Companion")
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#1E293B"))
            setPadding(28, 24, 28, 24)
        }
        formCard.addView(nameInput)

        // API Base URL Input
        val urlLabel = createInputLabel("API BASE URL")
        formCard.addView(urlLabel)
        val urlInput = EditText(this).apply {
            setText(prefs.apiBaseUrl)
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#1E293B"))
            setPadding(28, 24, 28, 24)
        }
        formCard.addView(urlInput)

        // Error Feedback Label
        val feedbackView = TextView(this).apply {
            textSize = 13f
            setTextColor(Color.parseColor("#EF4444"))
            visibility = View.GONE
            setPadding(0, 16, 0, 0)
        }
        formCard.addView(feedbackView)

        // Pair Button
        val pairButton = Button(this).apply {
            text = "Pair Device"
            setBackgroundColor(Color.parseColor("#2563EB"))
            setTextColor(Color.WHITE)
            typeface = Typeface.DEFAULT_BOLD
            setPadding(32, 28, 32, 28)
            setOnClickListener {
                val code = codeInput.text.toString().trim()
                val devName = nameInput.text.toString().trim()
                val url = urlInput.text.toString().trim()

                if (code.length != 8) {
                    feedbackView.setTextColor(Color.parseColor("#EF4444"))
                    feedbackView.text = "Please enter a valid 8-character pairing code."
                    feedbackView.visibility = View.VISIBLE
                    return@setOnClickListener
                }

                feedbackView.visibility = View.GONE
                isEnabled = false
                text = "Pairing..."

                executePairing(code, devName, url, feedbackView, this)
            }
        }
        val buttonParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = 32 }
        formCard.addView(pairButton, buttonParams)

        // Test Connection Button
        val testConnButton = Button(this).apply {
            text = "Test Server Connection (/health)"
            setBackgroundColor(Color.parseColor("#334155"))
            setTextColor(Color.parseColor("#CBD5E1"))
            setPadding(24, 20, 24, 20)
            setOnClickListener {
                val url = urlInput.text.toString().trim()
                feedbackView.setTextColor(Color.parseColor("#94A3B8"))
                feedbackView.text = "Testing connectivity to $url/health..."
                feedbackView.visibility = View.VISIBLE

                scope.launch(Dispatchers.IO) {
                    try {
                        val req = Request.Builder()
                            .url("${url.trimEnd('/')}/health")
                            .get()
                            .build()
                        val res = httpClient.newCall(req).execute()
                        val body = res.body?.string() ?: ""
                        withContext(Dispatchers.Main) {
                            if (res.isSuccessful) {
                                feedbackView.setTextColor(Color.parseColor("#22C55E"))
                                feedbackView.text = "Connection Successful! ($url is reachable, HTTP ${res.code})"
                            } else {
                                feedbackView.setTextColor(Color.parseColor("#EF4444"))
                                feedbackView.text = "Server responded with HTTP ${res.code}: $body"
                            }
                        }
                    } catch (e: Exception) {
                        withContext(Dispatchers.Main) {
                            feedbackView.setTextColor(Color.parseColor("#EF4444"))
                            feedbackView.text = "Connection Failed: ${e.message}"
                        }
                    }
                }
            }
        }
        val testConnParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = 16 }
        formCard.addView(testConnButton, testConnParams)

        rootContainer.addView(formCard)
    }

    private fun executePairing(
        code: String,
        devName: String,
        baseUrl: String,
        feedbackView: TextView,
        pairButton: Button
    ) {
        scope.launch(Dispatchers.IO) {
            try {
                prefs.apiBaseUrl = baseUrl

                val payload = JsonObject().apply {
                    addProperty("pairingCode", code)
                    addProperty("deviceName", devName)
                    addProperty("deviceFingerprint", "oneplus_nord_${System.currentTimeMillis()}")
                    addProperty("androidVersion", "Android ${android.os.Build.VERSION.RELEASE} (API ${android.os.Build.VERSION.SDK_INT})")
                }

                val body = payload.toString().toRequestBody("application/json".toMediaType())
                val request = Request.Builder()
                    .url("${baseUrl.trimEnd('/')}/api/v1/devices/pair")
                    .post(body)
                    .build()

                val response = httpClient.newCall(request).execute()
                val respStr = response.body?.string() ?: ""

                if (!response.isSuccessful) {
                    val errorMsg = try {
                        val errJson = gson.fromJson(respStr, JsonObject::class.java)
                        errJson.getAsJsonObject("error")?.get("message")?.asString ?: "HTTP ${response.code}"
                    } catch (e: Exception) {
                        "Pairing rejected (HTTP ${response.code})"
                    }
                    withContext(Dispatchers.Main) {
                        feedbackView.text = errorMsg
                        feedbackView.visibility = View.VISIBLE
                        pairButton.isEnabled = true
                        pairButton.text = "Pair Device"
                    }
                    return@launch
                }

                val json = gson.fromJson(respStr, JsonObject::class.java)
                val data = json.getAsJsonObject("data")

                prefs.deviceId = data.get("deviceId").asString
                prefs.deviceToken = data.get("deviceToken").asString
                prefs.merchantId = data.get("merchantId").asString
                prefs.merchantName = data.get("merchantName").asString

                Log.i(NotificationPermissionHelper.TAG, "Device successfully paired to ${prefs.merchantName}")

                withContext(Dispatchers.Main) {
                    evaluateAndRenderState()
                }
            } catch (e: Exception) {
                Log.e(NotificationPermissionHelper.TAG, "Device pairing call failed", e)
                withContext(Dispatchers.Main) {
                    feedbackView.text = "Connection failed: ${e.message}"
                    feedbackView.visibility = View.VISIBLE
                    pairButton.isEnabled = true
                    pairButton.text = "Pair Device"
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // STATE 4: Permission Granted, Paired (Companion Dashboard)
    // -------------------------------------------------------------------------
    private var statsTextView: TextView? = null

    private fun renderDashboardView() {
        // Status Card
        val card = createCardLayout()
        val merchantTitle = TextView(this).apply {
            text = "Active Merchant: ${prefs.merchantName ?: "Paired Merchant"}"
            textSize = 17f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            setPadding(0, 0, 0, 8)
        }
        card.addView(merchantTitle)

        val deviceSub = TextView(this).apply {
            text = "Device ID: ${prefs.deviceId ?: "Unknown"}\nAPI: ${prefs.apiBaseUrl}"
            textSize = 12f
            setTextColor(Color.parseColor("#94A3B8"))
            setPadding(0, 0, 0, 16)
        }
        card.addView(deviceSub)

        val permBadge = createBadge("Notification Access: GRANTED", "#22C55E", "#14532D")
        card.addView(permBadge)

        val listenerStatus = if (NotificationListener.isConnected) {
            createBadge("Listener Service: CONNECTED", "#22C55E", "#14532D")
        } else {
            createBadge("Listener Service: STANDBY", "#F59E0B", "#78350F")
        }
        val badgeParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = 12 }
        card.addView(listenerStatus, badgeParams)

        // Sync Stats
        statsTextView = TextView(this).apply {
            text = "Queue Stats: Loading..."
            textSize = 14f
            setTextColor(Color.parseColor("#E2E8F0"))
            setPadding(0, 24, 0, 16)
        }
        card.addView(statsTextView)

        val syncButton = Button(this).apply {
            text = "Sync Now"
            setBackgroundColor(Color.parseColor("#2563EB"))
            setTextColor(Color.WHITE)
            setOnClickListener {
                triggerSync()
            }
        }
        card.addView(syncButton)

        rootContainer.addView(card)

        // Notification Simulator Card (Manual Testing)
        val simCard = createCardLayout()
        val simTitle = TextView(this).apply {
            text = "Notification Simulator (Diagnostic)"
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            setPadding(0, 0, 0, 8)
        }
        simCard.addView(simTitle)

        val simDesc = TextView(this).apply {
            text = "Simulate an incoming credit notification on-device to test capture without sending SMS."
            textSize = 12f
            setTextColor(Color.parseColor("#94A3B8"))
            setPadding(0, 0, 0, 16)
        }
        simCard.addView(simDesc)

        val simTextLabel = createInputLabel("SIMULATED NOTIFICATION TEXT")
        simCard.addView(simTextLabel)
        val simTextInput = EditText(this).apply {
            setText("A/c *0562 Credited for Rs:1.00 on 13-11-2026 18:25:24 by Mob Bk ref no 668387168541 Avl Bal Rs:1090.03.Never Share OTP/PIN/CVV-Union Bank of India")
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#1E293B"))
            setPadding(24, 20, 24, 20)
            textSize = 13f
        }
        simCard.addView(simTextInput)

        val simButton = Button(this).apply {
            text = "Simulate & Capture"
            setBackgroundColor(Color.parseColor("#334155"))
            setTextColor(Color.WHITE)
            setOnClickListener {
                val sampleText = simTextInput.text.toString().trim()
                simulateCapture(sampleText)
            }
        }
        val simBtnParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = 16 }
        simCard.addView(simButton, simBtnParams)

        rootContainer.addView(simCard)

        // Disconnect Button
        val disconnectButton = Button(this).apply {
            text = "Disconnect / Unpair Device"
            setBackgroundColor(Color.parseColor("#7F1D1D"))
            setTextColor(Color.parseColor("#FCA5A5"))
            setOnClickListener {
                prefs.clear()
                evaluateAndRenderState()
            }
        }
        val disconnectParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = 24 }
        rootContainer.addView(disconnectButton, disconnectParams)

        refreshPairedStats()
    }

    private fun refreshPairedStats() {
        scope.launch(Dispatchers.IO) {
            try {
                val pending = db.notificationDao().getPendingNotifications().size
                withContext(Dispatchers.Main) {
                    statsTextView?.text = "Queue Stats: $pending pending evidence items in local queue"
                }
            } catch (e: Exception) {
                Log.w(NotificationPermissionHelper.TAG, "Could not load stats", e)
            }
        }
    }

    private fun triggerSync() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val syncRequest = OneTimeWorkRequestBuilder<EvidenceSyncWorker>()
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(applicationContext).enqueue(syncRequest)
        refreshPairedStats()
    }

    private fun simulateCapture(sampleText: String) {
        scope.launch(Dispatchers.IO) {
            val dummyHash = MessageDigest.getInstance("SHA-256")
                .digest("com.google.android.apps.messaging:$sampleText:${System.currentTimeMillis()}".toByteArray())
                .joinToString("") { "%02x".format(it) }

            val dummyCaptured = CapturedNotification(
                packageName = "com.google.android.apps.messaging",
                appName = "Messages",
                title = "Union Bank of India",
                text = sampleText,
                bigText = sampleText,
                subText = null,
                summaryText = null,
                fullText = sampleText,
                postTime = System.currentTimeMillis(),
                notificationKey = "dummy_sim_${System.currentTimeMillis()}",
                contentHash = dummyHash
            )

            val eligibility = EvidenceEligibilityClassifier.classify(dummyCaptured)
            if (eligibility.isEligible) {
                val entity = NotificationEntity(
                    contentHash = dummyCaptured.contentHash,
                    packageName = dummyCaptured.packageName,
                    appName = dummyCaptured.appName,
                    title = dummyCaptured.title,
                    text = eligibility.sanitizedText,
                    postTime = dummyCaptured.postTime
                )
                db.notificationDao().insert(entity)
                triggerSync()
            }
            withContext(Dispatchers.Main) {
                refreshPairedStats()
            }
        }
    }

    // -------------------------------------------------------------------------
    // STATE 5: Error / Retry
    // -------------------------------------------------------------------------
    private fun renderErrorView() {
        val card = createCardLayout()

        val badge = createBadge("PERMISSION CHECK ERROR", "#EF4444", "#7F1D1D")
        card.addView(badge)

        val errorDesc = TextView(this).apply {
            text = "An unexpected error occurred while verifying notification access permissions:\n\n$lastErrorMessage"
            textSize = 14f
            setTextColor(Color.parseColor("#FCA5A5"))
            setPadding(0, 24, 0, 32)
        }
        card.addView(errorDesc)

        val retryButton = Button(this).apply {
            text = "Retry Permission Check"
            setBackgroundColor(Color.parseColor("#2563EB"))
            setTextColor(Color.WHITE)
            typeface = Typeface.DEFAULT_BOLD
            setPadding(32, 28, 32, 28)
            setOnClickListener {
                Log.i(NotificationPermissionHelper.TAG, "User clicked Retry Permission Check")
                evaluateAndRenderState()
            }
        }
        card.addView(retryButton)

        rootContainer.addView(card)
    }

    // -------------------------------------------------------------------------
    // UI Helpers
    // -------------------------------------------------------------------------
    private fun createCardLayout(): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#1E293B"))
            setPadding(36, 36, 36, 36)
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = 32
            }
            layoutParams = params
        }
    }

    private fun createBadge(label: String, textColorHex: String, bgColorHex: String): TextView {
        return TextView(this).apply {
            text = label
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor(textColorHex))
            setBackgroundColor(Color.parseColor(bgColorHex))
            setPadding(20, 10, 20, 10)
            gravity = Gravity.CENTER
        }
    }

    private fun createInputLabel(label: String): TextView {
        return TextView(this).apply {
            text = label
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#94A3B8"))
            setPadding(0, 16, 0, 8)
        }
    }
}
