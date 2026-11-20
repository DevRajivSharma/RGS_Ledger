# RGS Ledger Companion Proguard Rules
-keepattributes *Annotation*
-keepclassmembers class * {
    @androidx.room.* *;
}
-keep class com.rgsledger.companion.database.** { *; }
-keep class com.rgsledger.companion.parser.** { *; }
-keep class com.google.gson.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
