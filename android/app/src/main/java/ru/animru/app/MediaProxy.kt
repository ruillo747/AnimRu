package ru.animru.app

import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.net.HttpURLConnection
import java.net.URL

/**
 * Браузеру запрещено читать ответы без заголовков CORS: так ведёт себя
 * и CDN Anilibria (плейлисты для офлайн-копии), и API Kodik (каталог второй студии).
 * Внутри приложения забираем такие адреса нативно и отдаём странице
 * с разрешающими заголовками.
 */
object MediaProxy {

    /** Хосты, где проксируем только файлы видео и плейлисты. */
    private val mediaHosts = listOf(
        "anilibria.top",
        "anilibria.tv",
        "anilib.top",
        "libria.fun",
        "wwnd.space"
    )

    /** Хосты, где проксируем любой запрос: API Kodik вообще не знает про CORS. */
    private val apiHosts = listOf(
        "kodik-api.com",
        "kodikapi.com"
    )

    private val media = Regex(
        "\\.(m3u8|m3u|ts|m4s|mp4|key|vtt|srt)(\\?|$)",
        RegexOption.IGNORE_CASE
    )

    fun handles(request: WebResourceRequest): Boolean {
        if (!request.method.equals("GET", ignoreCase = true)) return false
        val host = request.url.host ?: return false
        if (apiHosts.any { host == it || host.endsWith(".$it") }) return true
        if (!mediaHosts.any { host == it || host.endsWith(".$it") }) return false
        return media.containsMatchIn(request.url.toString())
    }

    fun fetch(request: WebResourceRequest): WebResourceResponse? = runCatching {
        val connection = (URL(request.url.toString()).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 15000
            readTimeout = 30000
            instanceFollowRedirects = true
            request.requestHeaders.forEach { (name, value) ->
                if (!name.equals("Origin", true) && !name.equals("Referer", true)) {
                    runCatching { setRequestProperty(name, value) }
                }
            }
        }
        val code = connection.responseCode
        if (code >= 400) {
            connection.disconnect()
            return null
        }
        val type = connection.contentType
            ?.substringBefore(';')
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?: "application/octet-stream"
        val headers = mapOf(
            "Access-Control-Allow-Origin" to "*",
            "Access-Control-Allow-Headers" to "*",
            "Access-Control-Allow-Methods" to "GET,HEAD,OPTIONS",
            "Timing-Allow-Origin" to "*"
        )
        WebResourceResponse(type, null, code, "OK", headers, connection.inputStream)
    }.getOrNull()
}
