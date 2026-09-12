package ru.animru.app

import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.net.HttpURLConnection
import java.net.URL

/**
 * CDN Anilibria не отдаёт заголовки CORS, поэтому страница не может сама
 * прочитать плейлисты и сегменты для офлайн-копии. Внутри приложения
 * запрашиваем их нативно и возвращаем с разрешающими заголовками.
 */
object MediaProxy {

    private val hosts = listOf(
        "anilibria.top",
        "anilibria.tv",
        "anilib.top",
        "libria.fun",
        "wwnd.space"
    )

    private val media = Regex(
        "\\.(m3u8|m3u|ts|m4s|mp4|key|vtt|srt)(\\?|$)",
        RegexOption.IGNORE_CASE
    )

    fun handles(request: WebResourceRequest): Boolean {
        if (!request.method.equals("GET", ignoreCase = true)) return false
        val host = request.url.host ?: return false
        if (!hosts.any { host == it || host.endsWith(".$it") }) return false
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
