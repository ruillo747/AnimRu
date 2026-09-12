package ru.animru.app

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import java.net.URL
import java.util.concurrent.Executors

/**
 * Оболочка AnimRu на системном ядре WebView (Chromium) с фильтрами AdGuard.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var refresh: SwipeRefreshLayout
    private lateinit var progress: ProgressBar
    private lateinit var blocker: AdBlocker

    private val io = Executors.newSingleThreadExecutor()
    private var blocked = 0

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        web = findViewById(R.id.web)
        refresh = findViewById(R.id.refresh)
        progress = findViewById(R.id.progress)

        blocker = AdBlocker(this)
        io.execute {
            blocker.load()
            if (FilterSources.needsUpdate(this)) {
                if (FilterSources.update(this)) blocker.load()
            }
        }

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            userAgentString = "$userAgentString AnimRu/1.0"
        }
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null)

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                val url = request.url.toString()
                val pageHost = runCatching { URL(view.url ?: SITE).host }.getOrNull()
                if (!blocker.shouldBlock(url, pageHost)) return null
                blocked += 1
                return WebResourceResponse("text/plain", "utf-8", AdBlocker.emptyBody())
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                injectCosmetics(url)
            }

            override fun onPageFinished(view: WebView, url: String?) {
                refresh.isRefreshing = false
                injectCosmetics(url)
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                progress.progress = newProgress
                progress.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
            }
        }

        refresh.setOnRefreshListener { web.reload() }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        if (savedInstanceState == null) web.loadUrl(SITE) else web.restoreState(savedInstanceState)
    }

    /** Косметические правила AdGuard прячут блоки, которые уже пришли с разметкой. */
    private fun injectCosmetics(url: String?) {
        val host = runCatching { URL(url ?: return).host }.getOrNull() ?: return
        val css = blocker.cosmeticCssFor(host)
        if (css.isEmpty()) return
        val script = """
            (function(){
              var id='adguard-cosmetic';
              if(document.getElementById(id)) return;
              var s=document.createElement('style');
              s.id=id;
              s.textContent=${quote(css)};
              (document.head||document.documentElement).appendChild(s);
            })();
        """.trimIndent()
        web.evaluateJavascript(script, null)
    }

    private fun quote(text: String): String =
        "\"" + text.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ") + "\""

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        io.shutdownNow()
        super.onDestroy()
    }

    companion object {
        private const val SITE = "https://ruillo747.github.io/AnimRu/"
    }
}
