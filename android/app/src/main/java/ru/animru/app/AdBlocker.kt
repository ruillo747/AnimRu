package ru.animru.app

import android.content.Context
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.net.URL

/**
 * Блокировщик рекламы на правилах AdGuard.
 *
 * WebView не умеет использовать Content Blocker из Safari-мира, поэтому фильтры
 * применяются вручную: сетевые запросы отсекаются в shouldInterceptRequest,
 * а косметические правила (##selector) превращаются в CSS и вставляются в страницу.
 */
class AdBlocker(private val context: Context) {

    private data class Rule(val regex: Regex, val domains: List<String>)

    private val blockRules = mutableListOf<Rule>()
    private val allowRules = mutableListOf<Rule>()
    private val globalSelectors = linkedSetOf<String>()
    private val domainSelectors = mutableMapOf<String, MutableSet<String>>()

    /** Свои и плеерные домены не трогаем никогда, иначе сломается воспроизведение. */
    private val essentialHosts = listOf(
        "anilibria.top",
        "anilib.top",
        "libria.fun",
        "kodik-api.com",
        "kodikapi.com",
        "kodikplayer.com",
        "kodik.cc",
        "kodik.info",
        "shikimori.one",
        "cdn.jsdelivr.net",
        "supabase.co",
        "github.io"
    )

    val stylesheet: String
        get() = buildString {
            if (globalSelectors.isNotEmpty()) {
                append(globalSelectors.joinToString(","))
                append("{display:none !important}")
            }
        }

    fun cosmeticCssFor(host: String?): String {
        val builder = StringBuilder(stylesheet)
        if (host != null) {
            domainSelectors.forEach { (domain, selectors) ->
                if (host == domain || host.endsWith(".$domain")) {
                    builder.append(selectors.joinToString(","))
                    builder.append("{display:none !important}")
                }
            }
        }
        return builder.toString()
    }

    val ruleCount: Int get() = blockRules.size + allowRules.size

    /** Сначала списки из assets, потом — скачанные обновления из кэша. */
    fun load() {
        blockRules.clear()
        allowRules.clear()
        globalSelectors.clear()
        domainSelectors.clear()

        FilterSources.ASSET_FILES.forEach { name ->
            runCatching { context.assets.open("filters/$name").use(::parse) }
        }
        FilterSources.cachedFiles(context).forEach { file ->
            runCatching { file.inputStream().use(::parse) }
        }
    }

    private fun parse(stream: InputStream) {
        stream.bufferedReader().forEachLine { raw ->
            val line = raw.trim()
            if (line.isEmpty() || line.startsWith("!") || line.startsWith("[")) return@forEachLine
            when {
                line.contains("##") -> addCosmetic(line)
                line.contains("#?#") || line.contains("#%#") || line.contains("#@#") -> Unit
                else -> addNetwork(line)
            }
        }
    }

    private fun addCosmetic(line: String) {
        val at = line.indexOf("##")
        val selector = line.substring(at + 2).trim()
        if (selector.isEmpty() || selector.contains(":has-text") || selector.contains(":contains")) return
        val scope = line.substring(0, at).trim()
        if (scope.isEmpty()) {
            globalSelectors += selector
        } else {
            scope.split(",").map { it.trim().removePrefix("~") }.filter { it.isNotEmpty() }.forEach { domain ->
                domainSelectors.getOrPut(domain) { linkedSetOf() } += selector
            }
        }
    }

    private fun addNetwork(line: String) {
        val exception = line.startsWith("@@")
        var body = if (exception) line.substring(2) else line

        var domains = emptyList<String>()
        val optionsAt = body.lastIndexOf('$')
        if (optionsAt > 0) {
            val options = body.substring(optionsAt + 1)
            /* правила с неподдержанными модификаторами просто пропускаем */
            if (options.contains("replace=") || options.contains("csp=") ||
                options.contains("removeparam") || options.contains("cookie")
            ) return
            domains = options.split(",")
                .firstOrNull { it.startsWith("domain=") }
                ?.removePrefix("domain=")
                ?.split("|")
                ?.filterNot { it.startsWith("~") }
                ?: emptyList()
            body = body.substring(0, optionsAt)
        }
        if (body.isEmpty()) return

        val regex = runCatching { toRegex(body) }.getOrNull() ?: return
        val rule = Rule(regex, domains)
        if (exception) allowRules += rule else blockRules += rule
    }

    /** Перевод шаблона AdGuard в регулярное выражение. */
    private fun toRegex(pattern: String): Regex {
        if (pattern.length > 2 && pattern.startsWith("/") && pattern.endsWith("/")) {
            return Regex(pattern.trim('/'), RegexOption.IGNORE_CASE)
        }
        val builder = StringBuilder()
        var index = 0
        if (pattern.startsWith("||")) {
            builder.append("^https?://([^/]+\\.)?")
            index = 2
        } else if (pattern.startsWith("|")) {
            builder.append('^')
            index = 1
        }
        var end = pattern.length
        if (pattern.endsWith("|")) end -= 1

        while (index < end) {
            when (val char = pattern[index]) {
                '*' -> builder.append(".*")
                '^' -> builder.append("([^0-9a-zA-Z_.%-]|\$)")
                '.', '+', '?', '(', ')', '[', ']', '{', '}', '|', '\\', '\$' -> {
                    builder.append('\\').append(char)
                }
                else -> builder.append(char)
            }
            index += 1
        }
        if (pattern.endsWith("|")) builder.append('$')
        return Regex(builder.toString(), RegexOption.IGNORE_CASE)
    }

    fun shouldBlock(url: String, pageHost: String?): Boolean {
        val host = runCatching { URL(url).host }.getOrNull() ?: return false
        if (essentialHosts.any { host == it || host.endsWith(".$it") }) return false
        if (allowRules.any { it.matches(url, pageHost) }) return false
        return blockRules.any { it.matches(url, pageHost) }
    }

    private fun Rule.matches(url: String, pageHost: String?): Boolean {
        if (domains.isNotEmpty()) {
            val host = pageHost ?: return false
            if (domains.none { host == it || host.endsWith(".$it") }) return false
        }
        return regex.containsMatchIn(url)
    }

    companion object {
        /** Пустой ответ вместо заблокированного запроса. */
        fun emptyBody(): InputStream = ByteArrayInputStream(ByteArray(0))
    }
}
