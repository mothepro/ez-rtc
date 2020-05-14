import { Emitter, SafeEmitter } from 'fancy-emitter'

export type Sendable = string | Blob | ArrayBuffer | ArrayBufferView

export const enum State {
  /** Initial state. Nothing has occurred. */
  OFFLINE,

  /** A Peer Connection has been established. */
  ONLINE,

  /**
   * The ICE agents have been given addresses to gather and it isn't finished
   * gathering candidates.
   */
  CONNECTING,

  /**
   * The peer connection has gathered the necessary ICE candidates and can
   * commence in actually talking with the peer by transferring offers and answers.
   */
  READY,

  /** The peer is connected and the data channels have been established. */
  CONNECTED,
}

export default class {

  private state = State.OFFLINE
  private readonly connection: RTCPeerConnection
  private channel?: RTCDataChannel

  /** Activates when the status has been updated. */
  readonly statusChange = new Emitter<State>(newState => this.state = newState)

  /** Activates when a new message is received through the channel. */
  readonly message = new SafeEmitter<Sendable>()

  constructor(
    urls: string[],

    // Dependecy Injection 
    peerConnection = RTCPeerConnection,
  ) {
    this.connection = new peerConnection

    try {
      // Sometimes creation can fail with a bad config.
      this.connection.setConfiguration({ iceServers: [{ urls }] })
      
      // Bind emitters, We don't care about the connection state nor signaling, only gathering
      this.connection.addEventListener('icegatheringstatechange', this.iceGatheringStateChange)
      this.connection.addEventListener('negotiationneeded', this.negotiationNeeded)
      this.connection.addEventListener('datachannel', this.newDataChannel)
      this.connection.addEventListener('icecandidateerror', this.errorEvent)
    } catch (e) {
      this.statusChange.deactivate(e)
      this.close()
    }
  }

  /** Sends some data through the channel. */
  send(data: any) {
    if (this.state != State.CONNECTED)
      throw Error('Unable to send data before a channel has been established.')

    this.channel!.send(data)
  }

  /** Gracefully ends the connection. */
  close = () => {
    this.statusChange.activate(State.OFFLINE).cancel()

    if (this.channel)
      this.channel.close()
    if (this.connection)
      this.connection.close()
  }

  /**
   * Create a new SDP, if needed, so another peer can connect with us.
   * Creates a data channel if one hasn't been created already.
   */
  createOffer = () => {
    if (!this.channel)
      this.bindChannel(this.connection.createDataChannel(''))
    return this.createSDP(this.connection.createOffer.bind(this.connection))
  }

  /**
   * Create a new SDP, if needed, so we may connect with another peer.
   * Waits for host to accept answer to make data channel.
   */
  createAnswer = () => this.createSDP(this.connection.createAnswer.bind(this.connection))

  /** Saves the SDP from a connecting client. */
  async acceptSDP(sdp: RTCSessionDescriptionInit) {
    try {
      await this.connection.setRemoteDescription(sdp)
    } catch (e) {
      this.statusChange.deactivate(e)
    }
  }

  private async createSDP(description: RTCPeerConnection['createOffer' | 'createAnswer']) {
    try {
      if (this.state == State.OFFLINE || this.state == State.CONNECTING) {
        this.connection.setLocalDescription(await description({
          iceRestart: false,
          offerToReceiveAudio: false,
          offerToReceiveVideo: false,
          voiceActivityDetection: false,
        }))

        // The offer is useless until we have gathered all ICE.
        for await (const state of this.statusChange)
          if (state == State.READY)
            break
      }

      return this.connection.localDescription!
    } catch (e) {
      this.statusChange.deactivate(e)
      throw e
    }
  }

  /** Binds the emitters to the channel. */
  private bindChannel(channel: RTCDataChannel) {
    if (this.channel)
      this.statusChange.deactivate(Error('Can not rebind a new data channel.'))
    else
      this.channel = channel

    channel.binaryType = 'arraybuffer'
    channel.addEventListener('open', () => this.statusChange.activate(State.CONNECTED))
    channel.addEventListener('message', ({ data }: MessageEvent) => this.message.activate(data))
    channel.addEventListener('error', ({ error }: RTCErrorEvent) => this.statusChange.deactivate(error!))
    channel.addEventListener('close', this.close)
  }

  /** Something changed with our gathering state. */
  private iceGatheringStateChange = () => {
    switch (this.connection.iceGatheringState) {
      case 'new':
        return this.statusChange.activate(State.ONLINE)

      case 'gathering':
        return this.statusChange.activate(State.CONNECTING)

      case 'complete':
        return this.statusChange.activate(State.READY)
    }
    this.statusChange.deactivate(Error(`Unexpected iceGatheringState ${this.connection.iceGatheringState}`))
  }

  /** Close if we have already gone too far in the process. */
  private negotiationNeeded: NonNullable<RTCPeerConnection['onnegotiationneeded']> =
    () => this.state == State.CONNECTED || this.state == State.READY && this.close()

  /** A data channel has been created for us. (We are a receiver.) */
  private newDataChannel: NonNullable<RTCPeerConnection['ondatachannel']> =
    ({ channel }) => this.bindChannel(channel)

  /** An error occurred with an ICE connection or gathering. */
  private errorEvent: NonNullable<RTCPeerConnection['onicecandidateerror']> =
    ({ errorCode, errorText, hostCandidate, url }: RTCPeerConnectionIceErrorEvent) => {
      const err = Error(errorText)
        ; (err as Error & RTCPeerConnectionIceErrorEventInit).errorCode = errorCode
        ; (err as Error & RTCPeerConnectionIceErrorEventInit).hostCandidate = hostCandidate
        ; (err as Error & RTCPeerConnectionIceErrorEventInit).url = url
      this.statusChange.deactivate(err)
    }
}
