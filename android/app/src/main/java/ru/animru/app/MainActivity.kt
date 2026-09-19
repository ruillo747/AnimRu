package ru.animru.app

import android.annotation.SuppressLint
import android.content.pm.ActivityInfo
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.webkit.WebViewCompat
import java.net.URL
import java.util.concurrent.Executors

/** Защищённая WebView-оболочка AnimRu с фильтрами AdGuard. */
class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private lateinit var refresh: SwipeRefreshLayout
    private lateinit var progress: ProgressBar
    private lateinit var blocker: AdBlocker
    private val io = Executors.newSingleThreadExecutor()

    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null
    private var splash: FrameLayout? = null
    private var splashMark: TextView? = null
    private var splashLabel: TextView? = null
    private var splashClosed = false

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
            if (FilterSources.needsUpdate(this) && FilterSources.update(this)) blocker.load()
        }

        configureWeb(web)
        refresh.setOnRefreshListener { web.reload() }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    fullscreenView != null -> web.webChromeClient?.onHideCustomView()
                    web.canGoBack() -> web.goBack()
                    else -> finish()
                }
            }
        })

        if (savedInstanceState == null) {
            showSplash()
            web.loadUrl(SITE)
        } else {
            splashClosed = true
            val restored = runCatching { web.restoreState(savedInstanceState) }.getOrNull()
            if (restored == null) web.loadUrl(SITE)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWeb(view: WebView) {
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            userAgentString = "$userAgentString AnimRu/1.2"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) safeBrowsingEnabled = true
        }
        view.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        WebViewCompat.setRendererPriorityPolicy(view, WebViewCompat.RENDERER_PRIORITY_BOUND, true)

        view.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val url = request.url.toString()
                val pageHost = runCatching { URL(view.url ?: SITE).host }.getOrNull()
                if (blocker.shouldBlock(url, pageHost)) {
                    return WebResourceResponse("text/plain", "utf-8", AdBlocker.emptyBody())
                }
                if (MediaProxy.handles(request)) return MediaProxy.fetch(request)
                return null
            }

            override fun onPageFinished(view: WebView, url: String?) {
                refresh.isRefreshing = false
                injectCosmetics(view, url)
                view.postDelayed({ hideSplash() }, 220)
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail?): Boolean {
                runOnUiThread { recoverWeb(view) }
                return true
            }
        }

        view.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                progress.progress = newProgress
                progress.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
            }

            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                if (fullscreenView != null) {
                    callback.onCustomViewHidden()
                    return
                }
                fullscreenView = view
                fullscreenCallback = callback
                (window.decorView as ViewGroup).addView(
                    view,
                    FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                )
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                supportActionBar?.hide()
                requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            }

            override fun onHideCustomView() {
                val custom = fullscreenView ?: return
                (custom.parent as? ViewGroup)?.removeView(custom)
                fullscreenView = null
                fullscreenCallback?.onCustomViewHidden()
                fullscreenCallback = null
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            }
        }
    }

    private fun recoverWeb(dead: WebView) {
        if (!::web.isInitialized || dead !== web || isFinishing || isDestroyed) return
        val parent = dead.parent as? ViewGroup ?: return
        val index = parent.indexOfChild(dead)
        val params = dead.layoutParams
        val last = dead.url?.takeIf { it.startsWith("https://ruillo747.github.io/AnimRu/") } ?: SITE

        if (fullscreenView != null) dead.webChromeClient?.onHideCustomView()
        parent.removeView(dead)
        runCatching { dead.stopLoading(); dead.removeAllViews(); dead.destroy() }

        val fresh = WebView(this)
        fresh.id = R.id.web
        fresh.layoutParams = params
        parent.addView(fresh, index)
        web = fresh
        configureWeb(fresh)
        refresh.isRefreshing = false
        progress.visibility = View.GONE
        fresh.loadUrl(last)
    }

    private fun showSplash() {
        val holder = FrameLayout(this).apply {
            setBackgroundColor(BACKGROUND)
            isClickable = true
        }
        val mark = TextView(this).apply {
            text = "A"
            textSize = 64f
            setTextColor(ACCENT)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        holder.addView(mark, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            gravity = Gravity.CENTER
            bottomMargin = dp(34)
        })
        val label = TextView(this).apply {
            text = "AnimRu"
            textSize = 17f
            setTextColor(0xFFF2F2F3.toInt())
            letterSpacing = 0.18f
        }
        holder.addView(label, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            gravity = Gravity.CENTER
            topMargin = dp(46)
        })
        (window.decorView as ViewGroup).addView(holder, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        splash = holder
        splashMark = mark
        splashLabel = label
        splashClosed = false

        mark.alpha = 0f
        mark.scaleX = 0.9f
        mark.scaleY = 0.9f
        mark.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(420)
            .setInterpolator(DecelerateInterpolator(1.8f)).start()
        label.alpha = 0f
        label.translationY = dp(8).toFloat()
        label.animate().alpha(1f).translationY(0f).setStartDelay(140).setDuration(280)
            .setInterpolator(DecelerateInterpolator(1.4f)).start()
        holder.postDelayed({ hideSplash() }, 4200)
    }

    private fun hideSplash() {
        if (splashClosed) return
        val holder = splash ?: return
        splashClosed = true
        splashMark?.animate()?.scaleX(1.08f)?.scaleY(1.08f)?.setDuration(240)
            ?.setInterpolator(DecelerateInterpolator(1.2f))?.start()
        splashLabel?.animate()?.alpha(0f)?.setDuration(160)?.start()
        holder.animate().alpha(0f).setStartDelay(80).setDuration(220)
            .setInterpolator(DecelerateInterpolator(1.2f))
            .withEndAction {
                (holder.parent as? ViewGroup)?.removeView(holder)
                splash = null
                splashMark = null
                splashLabel = null
            }.start()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun injectCosmetics(target: WebView, url: String?) {
        val host = runCatching { URL(url ?: return).host }.getOrNull() ?: return
        val css = blocker.cosmeticCssFor(host)
        if (css.isEmpty()) return
        val script = """
            (function(){
              var id='adguard-cosmetic';
              var old=document.getElementById(id); if(old) old.remove();
              var s=document.createElement('style'); s.id=id; s.textContent=${quote(css)};
              (document.head||document.documentElement).appendChild(s);
            })();
        """.trimIndent()
        runCatching { target.evaluateJavascript(script, null) }
    }

    private fun quote(text: String): String =
        "\"" + text.replace("\\", "\\\\").replace("\"", "\\\"").replace("\r", " ").replace("\n", " ") + "\""

    override fun onResume() {
        super.onResume()
        if (::web.isInitialized) {
            web.onResume()
            if (web.url.isNullOrBlank()) web.loadUrl(SITE)
        }
    }

    override fun onPause() {
        if (::web.isInitialized) web.onPause()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (::web.isInitialized) runCatching { web.saveState(outState) }
    }

    override fun onDestroy() {
        io.shutdownNow()
        if (::web.isInitialized) runCatching {
            (web.parent as? ViewGroup)?.removeView(web)
            web.stopLoading()
            web.removeAllViews()
            web.destroy()
        }
        super.onDestroy()
    }

    companion object {
        private const val SITE = "https://ruillo747.github.io/AnimRu/"
        private const val BACKGROUND = 0xFF0A0A0B.toInt()
        private const val ACCENT = 0xFFFF7A18.toInt()
    }
}
