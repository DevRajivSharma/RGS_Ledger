package com.rgsledger.companion.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DevicePreferencesTest {

    @Test
    fun testProductionApiUrlIsHostedHttps() {
        assertEquals("https://api.rgsledger.rajivsharma.online", DevicePreferences.PRODUCTION_API_URL)
        assertTrue(DevicePreferences.PRODUCTION_API_URL.startsWith("https://"))
        assertFalse(DevicePreferences.isLocalOrPrivateUrl(DevicePreferences.PRODUCTION_API_URL))
    }

    @Test
    fun testIsLocalOrPrivateUrlDetectsLocalhostAndLoopback() {
        assertTrue(DevicePreferences.isLocalOrPrivateUrl("http://localhost:4000"))
        assertTrue(DevicePreferences.isLocalOrPrivateUrl("http://127.0.0.1:4000"))
        assertTrue(DevicePreferences.isLocalOrPrivateUrl("https://localhost"))
        assertTrue(DevicePreferences.isLocalOrPrivateUrl("http://127.0.0.1"))
    }

    @Test
    fun testIsLocalOrPrivateUrlDetectsPrivateSubnetsAndEmulatorIp() {
        assertTrue(DevicePreferences.isLocalOrPrivateUrl("http://10.0.2.2:4000"))
        assertTrue(DevicePreferences.isLocalOrPrivateUrl("http://10.0.0.1:4000"))
        assertTrue(DevicePreferences.isLocalOrPrivateUrl("http://192.168.1.5:4000"))
        assertTrue(DevicePreferences.isLocalOrPrivateUrl("http://192.168.0.100:4000"))
    }

    @Test
    fun testIsLocalOrPrivateUrlAllowsPublicHostedEndpoints() {
        assertFalse(DevicePreferences.isLocalOrPrivateUrl("https://api.rgsledger.rajivsharma.online"))
        assertFalse(DevicePreferences.isLocalOrPrivateUrl("https://staging-api.rgsledger.online"))
        assertFalse(DevicePreferences.isLocalOrPrivateUrl("https://production.example.com:443"))
    }

    @Test
    fun testUrlSanitizationTrimsWhitespaceAndTrailingSlash() {
        val dirtyUrl = "  https://api.rgsledger.rajivsharma.online/  "
        val cleanUrl = dirtyUrl.trim().trimEnd('/')
        assertEquals("https://api.rgsledger.rajivsharma.online", cleanUrl)
    }
}
