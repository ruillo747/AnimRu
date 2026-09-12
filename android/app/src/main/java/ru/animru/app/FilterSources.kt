package ru.animru.app

import android.content.Context
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Источники фильтров AdGuard.
 *
 * В assets лежит базовый набор, чтобы блокировка работала сразу после установки
 * и без сети. Полные списки подтягиваются с серверов AdGuard и кэшируются на сутки.
 */
object FilterSources {

    val ASSET_FILES = listOf("adguard-base.txt", "adguard-russian.txt")

    private val REMOTE = mapOf(
        "adguard-base-full.txt" to "https://filters.adtidy.org/extension/chromium/filters/2.txt",
        "adguard-russian-full.txt" to "https://filters.adtidy.org/extension/chromium/filters/1.txt",
        "adguard-mobile-full.txt" to "https://filters.adtidy.org/extension/chromium/filters/11.txt"
    )

    private const val MAX_AGE_MS = 24L * 60 * 60 * 1000

    private fun dir(context: Context): File = File(context.filesDir, "filters").apply { mkdirs() }

    fun cachedFiles(context: Context): List<File> =
        dir(context).listFiles()?.filter { it.isFile && it.length() > 0 }?.sortedBy { it.name } ?: emptyList()

    fun needsUpdate(context: Context): Boolean {
        val files = cachedFiles(context)
        if (files.size < REMOTE.size) return true
        val oldest = files.minOf { it.lastModified() }
        return System.currentTimeMillis() - oldest > MAX_AGE_MS
    }

    /** Скачивает списки; возвращает true, если хоть что-то обновилось. */
    fun update(context: Context): Boolean {
        var changed = false
        REMOTE.forEach { (name, link) ->
            val text = download(link) ?: return@forEach
            if (text.length < 1024) return@forEach
            File(dir(context), name).writeText(text)
            changed = true
        }
        return changed
    }

    private fun download(link: String): String? = runCatching {
        val connection = URL(link).openConnection() as HttpURLConnection
        connection.connectTimeout = 15_000
        connection.readTimeout = 30_000
        connection.setRequestProperty("User-Agent", "AnimRu-Android")
        connection.inputStream.use { it.bufferedReader().readText() }
    }.getOrNull()
}
