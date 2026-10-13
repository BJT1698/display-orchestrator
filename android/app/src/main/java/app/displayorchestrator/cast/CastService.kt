package app.displayorchestrator.cast

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ComponentCallbacks
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.content.res.Configuration
import android.media.projection.MediaProjection
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.view.WindowManager
import org.json.JSONObject
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpParameters
import org.webrtc.RtpReceiver
import org.webrtc.RtpTransceiver
import org.webrtc.ScreenCapturerAndroid
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import java.util.UUID
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Captures the phone screen and streams it to the approved display over WebRTC, like the
 * dashboard does from a browser: one complete offer, one complete answer, media peer to peer.
 * A foreground service, so sharing goes on while the user opens the app they want to show.
 */
class CastService : Service() {

    companion object {
        private const val EXTRA_RESULT = "projection"
        private const val ACTION_STOP = "app.displayorchestrator.cast.STOP"
        private const val CHANNEL = "sharing"
        private const val NOTIFICATION_ID = 1
        private const val MAX_SIDE = 1920
        private const val FPS = 30

        var running = false
            private set

        fun start(context: Context, projection: Intent) {
            val intent = Intent(context, CastService::class.java).putExtra(EXTRA_RESULT, projection)
            context.startForegroundService(intent)
        }

        fun stop(context: Context) {
            context.startService(Intent(context, CastService::class.java).setAction(ACTION_STOP))
        }
    }

    private val main = Handler(Looper.getMainLooper())
    private var egl: EglBase? = null
    private var factory: PeerConnectionFactory? = null
    private var capturer: ScreenCapturerAndroid? = null
    private var textures: SurfaceTextureHelper? = null
    private var source: VideoSource? = null
    private var track: VideoTrack? = null
    private var pc: PeerConnection? = null
    private var castId: String? = null
    private var uuid: String? = null
    private var stopSignals: (() -> Unit)? = null
    private var stopState: (() -> Unit)? = null
    private var ended = false
    private var offerSent = false

    // Rotating the phone changes the picture's shape: follow it
    private val rotation = object : ComponentCallbacks {
        override fun onConfigurationChanged(newConfig: Configuration) {
            val (w, h) = captureSize()
            capturer?.changeCaptureFormat(w, h, FPS)
        }

        @Deprecated("Required by the interface")
        override fun onLowMemory() = Unit
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            finish(null)
            return START_NOT_STICKY
        }
        val projection = if (Build.VERSION.SDK_INT >= 33) {
            intent?.getParcelableExtra(EXTRA_RESULT, Intent::class.java)
        } else {
            @Suppress("DEPRECATION") intent?.getParcelableExtra(EXTRA_RESULT)
        }
        val session = GuestSession.state
        if (projection == null || session.status != "approved" || session.uuid == null) {
            stopSelf()
            return START_NOT_STICKY
        }

        // Android 14+: the media projection may only start once the service is in the foreground
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification(session.screenName), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIFICATION_ID, notification(session.screenName))
        }
        running = true
        ended = false
        offerSent = false
        try {
            startCast(projection, session)
        } catch (e: Exception) {
            finish("failed")
        }
        return START_NOT_STICKY
    }

    private fun startCast(projection: Intent, session: GuestSession.State) {
        val id = UUID.randomUUID().toString()
        castId = id
        uuid = session.uuid
        GuestSession.setCast("connecting")

        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(applicationContext).createInitializationOptions()
        )
        val egl = EglBase.create().also { egl = it }
        val factory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(egl.eglBaseContext, true, true))
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(egl.eglBaseContext))
            .createPeerConnectionFactory()
            .also { factory = it }

        val capturer = ScreenCapturerAndroid(projection, object : MediaProjection.Callback() {
            // The user stopped sharing from the system (status bar chip, lock screen)
            override fun onStop() {
                main.post { finish(null) }
            }
        }).also { capturer = it }
        val source = factory.createVideoSource(true).also { source = it }
        textures = SurfaceTextureHelper.create("screen", egl.eglBaseContext)
        capturer.initialize(textures, applicationContext, source.capturerObserver)
        val (w, h) = captureSize()
        capturer.startCapture(w, h, FPS)
        registerComponentCallbacks(rotation)

        val track = factory.createVideoTrack("screen", source).also { track = it }
        val servers = session.relays.map {
            PeerConnection.IceServer.builder(it.urls).setUsername(it.username).setPassword(it.credential).createIceServer()
        }
        val config = PeerConnection.RTCConfiguration(servers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_ONCE
        }
        val pc = factory.createPeerConnection(config, observer(id)) ?: throw IllegalStateException("no peer connection")
        this.pc = pc
        val sender = pc.addTrack(track, listOf("screen"))
        // Keep text sharp: drop frames rather than resolution when the network is tight
        sender?.parameters?.let { params ->
            params.degradationPreference = RtpParameters.DegradationPreference.MAINTAIN_RESOLUTION
            sender.parameters = params
        }

        stopSignals = GuestSession.onSignal { msg -> main.post { onSignal(msg) } }
        // The approval ended (time over, stopped by an operator, connection lost): stop at once
        stopState = GuestSession.observe { state ->
            if (castId != null && (state.status != "approved" || state.uuid != uuid)) main.post { finish(null) }
        }

        pc.createOffer(object : SdpAdapter() {
            override fun onCreateSuccess(desc: SessionDescription) {
                pc.setLocalDescription(SdpAdapter(), desc)
            }

            override fun onCreateFailure(error: String?) {
                main.post { finish("failed") }
            }
        }, MediaConstraints())

        // Send one complete offer, as the display does not take trickled candidates; with a relay
        // configured, gathering can stall on an unreachable address, so do not wait forever
        main.postDelayed({ sendOffer(id) }, if (servers.isEmpty()) 3000 else 5000)
        main.postDelayed({
            if (castId == id && GuestSession.state.cast != "connected") finish("timeout")
        }, 20000)
    }

    private fun sendOffer(id: String) {
        if (castId != id || offerSent) return
        offerSent = true
        val desc = pc?.localDescription ?: return finish("failed")
        val sent = GuestSession.send(
            JSONObject().put("type", "CAST_OFFER").put("uuid", uuid).put("castId", id).put("sdp", desc.description)
        )
        if (!sent) finish("lost")
    }

    private fun onSignal(msg: JSONObject) {
        val pc = pc ?: return
        when (msg.optString("type")) {
            "CAST_ANSWER" -> {
                if (msg.optString("castId") != castId || pc.signalingState() != PeerConnection.SignalingState.HAVE_LOCAL_OFFER) return
                pc.setRemoteDescription(object : SdpAdapter() {
                    override fun onSetFailure(error: String?) {
                        main.post { finish("failed") }
                    }
                }, SessionDescription(SessionDescription.Type.ANSWER, msg.optString("sdp")))
            }
            "CAST_STATUS" -> {
                val status = msg.optString("status")
                if (status == "offline" || status == "replaced") finish(status)
            }
        }
    }

    private fun observer(id: String) = object : PeerConnection.Observer {
        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {
            if (state == PeerConnection.IceGatheringState.COMPLETE) main.post { sendOffer(id) }
        }

        override fun onConnectionChange(state: PeerConnection.PeerConnectionState) {
            main.post {
                if (castId != id) return@post
                when (state) {
                    PeerConnection.PeerConnectionState.CONNECTED -> GuestSession.setCast("connected")
                    PeerConnection.PeerConnectionState.DISCONNECTED -> GuestSession.setCast("disconnected")
                    PeerConnection.PeerConnectionState.FAILED -> finish("failed")
                    else -> Unit
                }
            }
        }

        override fun onSignalingChange(state: PeerConnection.SignalingState) = Unit
        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) = Unit
        override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
        override fun onIceCandidate(candidate: IceCandidate) = Unit
        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) = Unit
        override fun onAddStream(stream: MediaStream) = Unit
        override fun onRemoveStream(stream: MediaStream) = Unit
        override fun onDataChannel(channel: DataChannel) = Unit
        override fun onRenegotiationNeeded() = Unit
        override fun onAddTrack(receiver: RtpReceiver, streams: Array<out MediaStream>) = Unit
        override fun onTrack(transceiver: RtpTransceiver) = Unit
    }

    /** The screen's real size, scaled so the long side is at most 1920 (even numbers for the encoder) */
    private fun captureSize(): Pair<Int, Int> {
        val wm = getSystemService(WINDOW_SERVICE) as WindowManager
        val (w, h) = if (Build.VERSION.SDK_INT >= 30) {
            val b = wm.maximumWindowMetrics.bounds
            b.width() to b.height()
        } else {
            val m = DisplayMetrics()
            @Suppress("DEPRECATION") wm.defaultDisplay.getRealMetrics(m)
            m.widthPixels to m.heightPixels
        }
        val scale = minOf(1.0, MAX_SIDE.toDouble() / max(w, h))
        fun even(v: Double) = ((v / 2).roundToInt() * 2).coerceAtLeast(2)
        return even(w * scale) to even(h * scale)
    }

    private fun notification(screen: String?): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, getString(R.string.channel_sharing), NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val stop = PendingIntent.getService(
            this, 1, Intent(this, CastService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE
        )
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_cast)
            .setContentTitle(getString(R.string.notification_title, screen ?: getString(R.string.a_screen)))
            .setContentText(getString(R.string.notification_text))
            .setContentIntent(open)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(null, getString(R.string.stop_sharing), stop).build())
            .build()
    }

    /** Ends the stream; [reason] is shown in the app when it is not the user's own choice */
    private fun finish(reason: String?) {
        if (ended) return
        ended = true
        val id = castId
        castId = null
        if (id != null && GuestSession.state.status == "approved") {
            GuestSession.send(JSONObject().put("type", "CAST_STOP").put("uuid", uuid))
        }
        GuestSession.setCast(reason)
        stopSignals?.invoke()
        stopState?.invoke()
        try { unregisterComponentCallbacks(rotation) } catch (_: Exception) {}
        try { capturer?.stopCapture() } catch (_: Exception) {}
        capturer?.dispose()
        pc?.dispose()
        track?.dispose()
        source?.dispose()
        textures?.dispose()
        factory?.dispose()
        egl?.release()
        capturer = null; pc = null; track = null; source = null; textures = null; factory = null; egl = null
        running = false
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        finish(null)
        super.onDestroy()
    }

    private open class SdpAdapter : SdpObserver {
        override fun onCreateSuccess(desc: SessionDescription) = Unit
        override fun onSetSuccess() = Unit
        override fun onCreateFailure(error: String?) = Unit
        override fun onSetFailure(error: String?) = Unit
    }
}
