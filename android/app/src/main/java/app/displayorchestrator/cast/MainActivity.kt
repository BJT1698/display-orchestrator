package app.displayorchestrator.cast

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.Spinner
import android.widget.TextView
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** One screen, the same steps as the /cast web page: server, request, code, approval, share */
class MainActivity : Activity() {

    private val prefs by lazy { getSharedPreferences("signage", MODE_PRIVATE) }
    private var unobserve: (() -> Unit)? = null
    private var editingServer = false
    private var screenChoices: List<GuestSession.Screen?> = emptyList()
    private var chosenUuid: String? = null

    private lateinit var serverForm: View
    private lateinit var server: EditText
    private lateinit var connect: Button
    private lateinit var serverLine: View
    private lateinit var serverText: TextView
    private lateinit var linkTally: View
    private lateinit var notice: TextView
    private lateinit var requestForm: View
    private lateinit var name: EditText
    private lateinit var screen: Spinner
    private lateinit var ask: Button
    private lateinit var pending: View
    private lateinit var code: TextView
    private lateinit var approved: View
    private lateinit var approvedText: TextView
    private lateinit var castTally: View
    private lateinit var castText: TextView
    private lateinit var share: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        serverForm = findViewById(R.id.serverForm)
        server = findViewById(R.id.server)
        connect = findViewById(R.id.connect)
        serverLine = findViewById(R.id.serverLine)
        serverText = findViewById(R.id.serverText)
        linkTally = findViewById(R.id.linkTally)
        notice = findViewById(R.id.notice)
        requestForm = findViewById(R.id.requestForm)
        name = findViewById(R.id.name)
        screen = findViewById(R.id.screen)
        ask = findViewById(R.id.ask)
        pending = findViewById(R.id.pending)
        code = findViewById(R.id.code)
        approved = findViewById(R.id.approved)
        approvedText = findViewById(R.id.approvedText)
        castTally = findViewById(R.id.castTally)
        castText = findViewById(R.id.castText)
        share = findViewById(R.id.share)

        server.setText(prefs.getString("server", ""))
        name.setText(prefs.getString("name", ""))

        connect.setOnClickListener { connectToServer() }
        server.setOnEditorActionListener { _, action, _ ->
            if (action == EditorInfo.IME_ACTION_GO) connectToServer()
            true
        }
        findViewById<View>(R.id.changeServer).setOnClickListener {
            if (CastService.running) CastService.stop(this)
            GuestSession.disconnect()
            editingServer = true
            render(GuestSession.state)
        }
        ask.setOnClickListener { askToShare() }
        share.setOnClickListener {
            if (CastService.running) CastService.stop(this) else chooseWhatToShare()
        }
        screen.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                chosenUuid = screenChoices.getOrNull(position)?.uuid
            }

            override fun onNothingSelected(parent: AdapterView<*>?) = Unit
        }

        // The foreground notification needs this on Android 13+
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 2)
        }

        // Connect straight away to the server used last time
        if (GuestSession.state.link == GuestSession.Link.OFFLINE && !server.text.isNullOrBlank()) {
            GuestSession.connect(server.text.toString())
        }
    }

    override fun onStart() {
        super.onStart()
        unobserve = GuestSession.observe { render(it) }
    }

    override fun onStop() {
        unobserve?.invoke()
        unobserve = null
        super.onStop()
    }

    private fun connectToServer() {
        val address = server.text.toString().trim()
        if (address.isEmpty()) return
        prefs.edit().putString("server", address).apply()
        editingServer = false
        hideKeyboard()
        GuestSession.connect(address)
    }

    private fun askToShare() {
        val who = name.text.toString().trim().replace(Regex("\\s+"), " ")
        if (who.isEmpty()) {
            name.requestFocus()
            return
        }
        prefs.edit().putString("name", who).apply()
        hideKeyboard()
        if (GuestSession.state.ended) GuestSession.reset()
        GuestSession.requestShare(who, chosenUuid)
    }

    @Suppress("DEPRECATION")
    private fun chooseWhatToShare() {
        val mpm = getSystemService(MediaProjectionManager::class.java)
        startActivityForResult(mpm.createScreenCaptureIntent(), 1)
    }

    @Deprecated("Activity result API of the framework Activity")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 1 && resultCode == RESULT_OK && data != null) {
            CastService.start(this, data)
        }
    }

    private fun render(s: GuestSession.State) {
        // While offline the line says it is retrying; "Change" opens the address again
        val showServerForm = editingServer || s.serverUrl == null || s.status == "badaddress"
        val online = s.link == GuestSession.Link.ONLINE

        serverForm.visible(showServerForm)
        connect.isEnabled = s.link != GuestSession.Link.CONNECTING || editingServer
        connect.setText(if (s.link == GuestSession.Link.CONNECTING && !editingServer) R.string.connecting else R.string.connect)
        serverLine.visible(!showServerForm)
        serverText.text = when (s.link) {
            GuestSession.Link.ONLINE -> getString(R.string.connected_to, s.serverUrl)
            GuestSession.Link.CONNECTING -> getString(R.string.connecting)
            GuestSession.Link.OFFLINE -> getString(R.string.reconnecting)
        }
        linkTally.tint(if (online) R.color.live else R.color.caution)

        val noticeText = when {
            s.status == "badaddress" -> getString(R.string.bad_address)
            s.ended -> getString(endedText(s.status))
            else -> null
        }
        notice.text = noticeText
        notice.visible(noticeText != null)

        val asking = s.status == "idle" || s.status == "sending" || s.ended
        requestForm.visible(!showServerForm && asking)
        ask.isEnabled = online && s.status != "sending"
        bindScreens(s.screens)

        pending.visible(s.status == "pending")
        code.text = s.code ?: ""

        approved.visible(s.status == "approved")
        if (s.status == "approved") {
            approvedText.text = getString(R.string.approved_for, s.screenName ?: getString(R.string.a_screen), clock(s.expiresAt))
            castText.text = s.cast?.let { castMessage(it) } ?: ""
            castText.visible(s.cast != null)
            castTally.tint(if (s.cast == "connected") R.color.live else if (s.cast == null) R.color.faint else R.color.caution)
            share.setText(
                when {
                    CastService.running -> R.string.stop_sharing
                    s.cast != null -> R.string.share_again
                    else -> R.string.start_sharing
                }
            )
        }
    }

    private fun bindScreens(screens: List<GuestSession.Screen>) {
        val choices = listOf<GuestSession.Screen?>(null) + screens
        if (choices == screenChoices) return
        screenChoices = choices
        val labels = choices.map {
            when {
                it == null -> getString(R.string.operator_chooses)
                it.online -> it.name
                else -> getString(R.string.offline_suffix, it.name)
            }
        }
        val adapter = object : ArrayAdapter<String>(this, R.layout.spinner_item, labels) {
            override fun isEnabled(position: Int) = choices[position]?.online != false
        }
        adapter.setDropDownViewResource(R.layout.spinner_item)
        screen.adapter = adapter
        val keep = choices.indexOfFirst { it?.uuid == chosenUuid }
        screen.setSelection(if (keep >= 0) keep else 0)
    }

    private fun endedText(status: String) = when (status) {
        "rejected" -> R.string.ended_rejected
        "expired" -> R.string.ended_expired
        "stopped" -> R.string.ended_stopped
        "lapsed" -> R.string.ended_lapsed
        "busy" -> R.string.ended_busy
        else -> R.string.ended_lost
    }

    private fun castMessage(status: String) = getString(
        when (status) {
            "connecting" -> R.string.cast_connecting
            "connected" -> R.string.cast_connected
            "disconnected" -> R.string.cast_disconnected
            "offline" -> R.string.cast_offline
            "replaced" -> R.string.cast_replaced
            "timeout" -> R.string.cast_timeout
            "lost" -> R.string.cast_lost
            else -> R.string.cast_failed
        }
    )

    private fun clock(iso: String?): String = try {
        OffsetDateTime.parse(iso).atZoneSameInstant(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("HH:mm"))
    } catch (e: Exception) {
        "--:--"
    }

    private fun hideKeyboard() {
        getSystemService(InputMethodManager::class.java).hideSoftInputFromWindow(window.decorView.windowToken, 0)
    }

    private fun View.visible(show: Boolean) {
        visibility = if (show) View.VISIBLE else View.GONE
    }

    private fun View.tint(color: Int) {
        backgroundTintList = ColorStateList.valueOf(getColor(color))
    }
}
