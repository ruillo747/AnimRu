package ru.animru.app

import android.annotation.SuppressLint
import android.content.pm.ActivityInfo
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.animation.AccelerateInterpolator
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

    /* полный экран видео: WebView отдаёт свою View, её нужно показать поверх всего */
    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null

    /* заставка входа: логотип наезжает и растворяется, пока грузится сайт */
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
            if (FilterSources.needsUpdate(this)) {
                if (FilterSources.update(this)) blocker.load()
            }
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
            /* состояние может оказаться повреждённым — тогда просто открываем сайт заново */
            val restored = runCatching { web.restoreState(savedInstanceState) }.getOrNull()
            if (restored == null) web.loadUrl(SITE)
        }
    }

    /** Все настройки и обработчики в одном месте: пригодятся при пересоздании WebView. */
    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWeb(view: WebView) {
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true
            allowFileAccess = true
            javaScriptCanOpenWindowsAutomatically = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            userAgentString = "$userAgentString AnimRu/1.0"
        }
        view.setLayerType(View.LAYER_TYPE_HARDWARE, null)

        view.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                val url = request.url.toString()
                val pageHost = runCatching { URL(view.url ?: SITE).host }.getOrNull()
                if (blocker.shouldBlock(url, pageHost)) {
                    blocked += 1
                    return WebResourceResponse("text/plain", "utf-8", AdBlocker.emptyBody())
                }
                if (MediaProxy.handles(request)) return MediaProxy.fetch(request)
                return null
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                injectCosmetics(url)
            }

            override fun onPageFinished(view: WebView, url: String?) {
                refresh.isRefreshing = false
                injectCosmetics(url)
                view.postDelayed({ hideSplash() }, 260)
            }

            /**
             * Система может убить процесс отрисовки WebView, пока приложение свёрнуто.
             * Без этой обработки второе открытие завершается падением.
             */
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail?): Boolean {
                recoverWeb(view)
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
                val root = window.decorView as ViewGroup
                root.addView(
                    view,
                    FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                )
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                supportActionBar?.hide()
                requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            }

            override fun onHideCustomView() {
                val view = fullscreenView ?: return
                (window.decorView as ViewGroup).removeView(view)
                fullscreenView = null
                fullscreenCallback?.onCustomViewHidden()
                fullscreenCallback = null
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            }
        }
    }

    /** Ставим на место погибшего WebView свежий и открываем сайт заново. */
    private fun recoverWeb(dead: WebView) {
        val parent = dead.parent as? ViewGroup ?: return
        val index = parent.indexOfChild(dead)
        val params = dead.layoutParams
        val last = dead.url ?: SITE

        parent.removeView(dead)
        runCatching { dead.destroy() }

        val fresh = WebView(this)
        fresh.id = R.id.web
        fresh.layoutParams = params
        parent.addView(fresh, index)
        web = fresh
        configureWeb(fresh)
        refresh.isRefreshing = false
        fresh.loadUrl(last)
    }

    /**
     * Анимация входа: оранжевый знак вырастает из центра, рядом проявляется название,
     * затем вся заставка приближается и гаснет, открывая сайт.
     */
    private fun showSplash() {
        val holder = FrameLayout(this)
        holder.setBackgroundColor(BACKGROUND)
        holder.isClickable = true

        val mark = TextView(this)
        mark.text = "A"
        mark.textSize = 64f
        mark.setTextColor(ACCENT)
        mark.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        val markParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        )
        markParams.gravity = Gravity.CENTER
        markParams.bottomMargin = dp(34)
        holder.addView(mark, markParams)

        val label = TextView(this)
        label.text = "AnimRu"
        label.textSize = 17f
        label.setTextColor(0xFFF2F2F3.toInt())
        label.letterSpacing = 0.22f
        val labelParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        )
        labelParams.gravity = Gravity.CENTER
        labelParams.topMargin = dp(46)
        holder.addView(label, labelParams)

        (window.decorView as ViewGroup).addView(
            holder,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )

        splash = holder
        splashMark = mark
        splashLabel = label
        splashClosed = false

        mark.alpha = 0f
        mark.scaleX = 0.62f
        mark.scaleY = 0.62f
        mark.animate()
            .alpha(1f)
            .scaleX(1f)
            .scaleY(1f)
            .setDuration(560)
            .setInterpolator(DecelerateInterpolator(1.8f))
            .start()

        label.alpha = 0f
        label.translationY = dp(10).toFloat()
        label.animate()
            .alpha(1f)
            .translationY(0f)
            .setStartDelay(220)
            .setDuration(420)
            .setInterpolator(DecelerateInterpolator(1.4f))
            .start()

        /* сайт может грузиться долго — заставка всё равно уйдёт сама */
        holder.postDelayed({ hideSplash() }, 4200)
    }

    private fun hideSplash() {
        if (splashClosed) return
        val holder = splash ?: return
        splashClosed = true

        splashMark?.animate()
            ?.scaleX(1.18f)
            ?.scaleY(1.18f)
            ?.setDuration(340)
            ?.setInterpolator(AccelerateInterpolator(1.4f))
            ?.start()
        splashLabel?.animate()?.alpha(0f)?.setDuration(200)?.start()

        holder.animate()
            .alpha(0f)
            .setStartDelay(140)
            .setDuration(300)
            .withEndAction {
                (holder.parent as? ViewGroup)?.removeView(holder)
                splash = null
                splashMark = null
                splashLabel = null
            }
            .start()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

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
        runCatching { web.evaluateJavascript(script, null) }
    }

    private fun quote(text: String): String =
        "\"" + text.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ") + "\""

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        runCatching { web.saveState(outState) }
    }

    override fun onDestroy() {
        io.shutdownNow()
        super.onDestroy()
    }

    companion object {
        private const val SITE = "https://ruillo747.github.io/AnimRu/"
        private const val BACKGROUND = 0xFF0A0A0B.toInt()
        private const val ACCENT = 0xFFFF7A18.toInt()
    }
}
