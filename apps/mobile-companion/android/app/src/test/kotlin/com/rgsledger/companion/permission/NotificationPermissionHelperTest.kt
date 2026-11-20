package com.rgsledger.companion.permission

import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationPermissionHelperTest {

    @Test
    fun testSettingsIntentCreatesNonNullObject() {
        val intent = NotificationPermissionHelper.createSettingsIntent()
        assertNotNull(intent)
    }

    @Test
    fun testParseEnabledListenersWithNullOrEmptyString() {
        assertFalse(NotificationPermissionHelper.isPackageOrComponentEnabled(null, "com.rgsledger.companion"))
        assertFalse(NotificationPermissionHelper.isPackageOrComponentEnabled("", "com.rgsledger.companion"))
        assertFalse(NotificationPermissionHelper.isPackageOrComponentEnabled("   ", "com.rgsledger.companion"))
    }

    @Test
    fun testParseEnabledListenersWithTargetComponent() {
        val pkg = "com.rgsledger.companion"
        val cls = "com.rgsledger.companion.NotificationListener"

        val exactMatch = "com.rgsledger.companion/com.rgsledger.companion.NotificationListener"
        assertTrue(NotificationPermissionHelper.isPackageOrComponentEnabled(exactMatch, pkg, cls))

        val shortMatch = "com.rgsledger.companion/.NotificationListener"
        assertTrue(NotificationPermissionHelper.isPackageOrComponentEnabled(shortMatch, pkg, cls))

        val multiMatch = "com.google.android.apps.messaging/.SmsListener:com.rgsledger.companion/com.rgsledger.companion.NotificationListener:com.whatsapp/.Listener"
        assertTrue(NotificationPermissionHelper.isPackageOrComponentEnabled(multiMatch, pkg, cls))
    }

    @Test
    fun testParseEnabledListenersRejectsUnrelatedPackages() {
        val pkg = "com.rgsledger.companion"
        val other = "com.other.app/com.other.app.Listener:com.another.app/.Service"
        assertFalse(NotificationPermissionHelper.isPackageOrComponentEnabled(other, pkg))

        val prefixAttack = "com.rgsledger.companion.fake/.Listener"
        assertFalse(NotificationPermissionHelper.isPackageOrComponentEnabled(prefixAttack, pkg))
    }
}
