package com.rgsledger.companion.database

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface NotificationDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(notification: NotificationEntity): Long

    @Query("SELECT * FROM captured_notifications WHERE status = 'PENDING' ORDER BY postTime ASC")
    suspend fun getPendingNotifications(): List<NotificationEntity>

    @Query("SELECT COUNT(*) FROM captured_notifications WHERE status = 'PENDING'")
    suspend fun getPendingCount(): Int

    @Query("SELECT COUNT(*) FROM captured_notifications WHERE status = 'FAILED'")
    suspend fun getFailedCount(): Int

    @Query("SELECT COUNT(*) FROM captured_notifications WHERE status = 'SYNCED'")
    suspend fun getSyncedCount(): Int

    @Query("UPDATE captured_notifications SET status = :status, lastError = :error, syncAttempts = syncAttempts + 1 WHERE id = :id")
    suspend fun updateStatus(id: Long, status: String, error: String? = null)

    @Query("SELECT * FROM captured_notifications WHERE contentHash = :hash LIMIT 1")
    suspend fun findByHash(hash: String): NotificationEntity?

    @Query("SELECT * FROM captured_notifications ORDER BY postTime DESC LIMIT 50")
    suspend fun getRecentNotifications(): List<NotificationEntity>

    @Query("DELETE FROM captured_notifications WHERE status = 'SYNCED' AND postTime < :olderThanMillis")
    suspend fun pruneSyncedNotifications(olderThanMillis: Long): Int
}
