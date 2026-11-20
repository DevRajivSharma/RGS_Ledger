package com.rgsledger.companion.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [NotificationEntity::class], version = 1, exportSchema = false)
abstract class EvidenceDatabase : RoomDatabase() {
    abstract fun notificationDao(): NotificationDao

    companion object {
        @Volatile
        private var INSTANCE: EvidenceDatabase? = null

        fun getDatabase(context: Context): EvidenceDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    EvidenceDatabase::class.java,
                    "rgs_evidence_db"
                ).build()
                INSTANCE = instance
                instance
            }
        }
    }
}
