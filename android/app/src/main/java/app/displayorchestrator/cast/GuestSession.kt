package app.displayorchestrator.cast

import android.os.Handler
import android.os.Looper
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * The link to the signage server, speaking the same guest protocol as the /cast web page:
 * GUEST_REQUEST -> code -> an operator approves in the dashboard -> CAST_OFFER / CAST_ANSWER.
 * One per process, so the stream keeps going while the user shows other apps.
 */
object GuestSession {

    enum class Link { OFFLINE, CONNECTING, ONLINE }

    data class Screen(val uuid: String, val name: String, val online: Boolean)

    data class Relay(val urls: List<String>, val username: String, val credential: String)

    data class State(
        val link: Link = Link.OFFLINE,
        val serverUrl: String? = null,
        val screens: List<Screen> = emptyList(),
        // idle, sending, pending, approved, or why it ended (rejected, expired, stopped, lapsed, busy, lost)
        val status: String = "idle",
        val code: String? = null,
        val uuid: String? = null,
        val screenName: String? = null,
        val expiresAt: String? = null,
        val relays: List<Relay> = emptyList(),
        // choosing, connecting, connected, disconnected, or an end reason; null when not sharing
        val cast: String? = null,
    ) {
        val ended get() = status in ENDED
    }

    val ENDED = setOf("rejected", "expired", "stopped", "lapsed", "busy", "lost")

    private val main = Handler(Looper.getMainLooper())
    private val client = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .connectTimeout(8, TimeUnit.SECONDS)
        .build()

    private var socket: WebSocket? = null
    private var wanted = false
    private val stateListeners = mutableSetOf<(State) -> Unit>()
    private val signalListeners = mutableSetOf<(JSONObject) -> Unit>()

    var state = State()
        private set

    fun observe(listener: (State) -> Unit): () -> Unit {
        stateListeners += listener
        listener(state)
        return { stateListeners -= listener }
    }

    /** CAST_ANSWER and CAST_STATUS from the screen, for the stream in [CastService] */
    fun onSignal(listener: (JSONObject) -> Unit): () -> Unit {
        signalListeners += listener
        return { signalListeners -= listener }
    }

    private fun update(change: (State) -> State) {
        state = change(state)
        val snapshot = state
        stateListeners.toList().forEach { it(snapshot) }
    }

    fun setCast(status: String?) = main.post { update { it.copy(cast = status) } }

    /** "signage.example.lan", "http://host:8080" or "https://host" -> the server's guest socket */
    fun socketUrl(server: String): String {
        val base = server.trim().trimEnd('/').let { if ("://" in it) it else "http://$it" }
        return base.replaceFirst(Regex("^http"), "ws") + "/ws?type=guest"
    }

    fun connect(server: String) {
        disconnect()
        wanted = true
        update { State(link = Link.CONNECTING, serverUrl = server) }
        open(server)
    }

    private fun open(server: String) {
        val request = try {
            Request.Builder().url(socketUrl(server)).build()
        } catch (e: IllegalArgumentException) {
            wanted = false
            update { it.copy(link = Link.OFFLINE, status = "badaddress") }
            return
        }
        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) = main.post {
                if (webSocket === socket) update { it.copy(link = Link.ONLINE) }
            }.let { }

            override fun onMessage(webSocket: WebSocket, text: String) = main.post {
                if (webSocket === socket) handle(text)
            }.let { }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = dropped(webSocket, server)

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.w("GuestSession", "Connection to $server failed: ${response?.code ?: ""} ${t.message}")
                dropped(webSocket, server)
            }
        })
    }

    private fun dropped(webSocket: WebSocket, server: String) {
        main.post {
            if (webSocket !== socket) return@post
            socket = null
            // The server forgets a request together with its connection: start over
            update { it.copy(link = Link.OFFLINE, status = if (it.status == "idle") "idle" else "lost", code = null) }
            if (wanted) main.postDelayed({ if (wanted && socket == null) {
                update { it.copy(link = Link.CONNECTING) }
                open(server)
            } }, 3000)
        }
    }

    fun disconnect() {
        wanted = false
        socket?.close(1000, "bye")
        socket = null
        update { State(serverUrl = it.serverUrl) }
    }

    fun send(message: JSONObject): Boolean = socket?.send(message.toString()) ?: false

    fun requestShare(name: String, uuid: String?) {
        val msg = JSONObject().put("type", "GUEST_REQUEST").put("name", name).put("uuid", uuid ?: JSONObject.NULL)
        if (send(msg)) update { it.copy(status = "sending", code = null) }
    }

    /** Back to the form after a request ended */
    fun reset() = update { it.copy(status = "idle", code = null, uuid = null, screenName = null, expiresAt = null, relays = emptyList(), cast = null) }

    private fun handle(text: String) {
        val msg = try { JSONObject(text) } catch (e: Exception) { return }
        when (msg.optString("type")) {
            "GUEST_DISPLAYS" -> update { it.copy(screens = parseScreens(msg.optJSONArray("data"))) }
            "GUEST_STATUS" -> update {
                val status = msg.optString("status")
                it.copy(
                    status = status,
                    code = msg.optString("code").ifEmpty { it.code },
                    uuid = msg.optString("uuid").ifEmpty { it.uuid },
                    screenName = msg.optString("displayName").ifEmpty { it.screenName },
                    expiresAt = msg.optString("expiresAt").ifEmpty { it.expiresAt },
                    relays = if (msg.has("iceServers")) parseRelays(msg.optJSONArray("iceServers")) else it.relays,
                )
            }
            "CAST_ANSWER", "CAST_STATUS" -> signalListeners.toList().forEach { it(msg) }
        }
    }

    private fun parseScreens(arr: JSONArray?): List<Screen> = buildList {
        for (i in 0 until (arr?.length() ?: 0)) {
            val o = arr!!.getJSONObject(i)
            add(Screen(o.getString("uuid"), o.optString("name", "Screen"), o.optString("status") == "online"))
        }
    }

    private fun parseRelays(arr: JSONArray?): List<Relay> = buildList {
        for (i in 0 until (arr?.length() ?: 0)) {
            val o = arr!!.getJSONObject(i)
            val urls = o.optJSONArray("urls")?.let { a -> List(a.length()) { a.getString(it) } }
                ?: listOf(o.optString("urls"))
            add(Relay(urls, o.optString("username"), o.optString("credential")))
        }
    }
}
