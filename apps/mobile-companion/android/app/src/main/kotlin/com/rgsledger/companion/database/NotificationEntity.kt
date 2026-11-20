package com.rgsledger.companion.database

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "captured_notifications")
data class NotificationEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val contentHash: String,
    val packageName: String,
    val appName: String,
    val title: String,
    val text: String,
    val postTime: Long,
    val status: String = "PENDING", // PENDING, SYNCED, FAILED
    val syncAttempts: Int = 0,
    val lastError: String? = null,
    val createdAt: Long = System.currentTimeMillis()
)
