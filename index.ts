import { Emitter, SafeEmitter, filterValue } from 'fancy-emitter'

export type Receiveable = string | Blob | ArrayBuffer
export type Sendable = Receiveable | ArrayBufferView

export const enum State {
  /** Initial state. Nothing has occurred. */
  OFFLINE,

  /** Data channel has been created and can now be used create an offer. */
  CAN_OFFER,

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

  /** Non-fatal Errors thrown during this proccess */
  readonly warnings: any[] = []

  /** Activates when the status has been updated. */
  readonly statusChange: Emitter<State> = new Emitter

  /** Activates when a new message is received through the channel. */
  readonly message: SafeEmitter<Receiveable> = new SafeEmitter

  constructor(
    /**
     * STUN servers to use.
     * 
     * One bad STUN address could cause...
     * + Offer creation to take ~1 minute.
     * + Undefined Long times to accept offer with possible failures thrown in the process.
     */
    urls: string[],

    // Dependecy Injection 
    peerConnection = RTCPeerConnection,
  ) {
    this.connection = new peerConnection

    this.statusChange
      .on(newState => this.state = newState)
      .catch(() => this.state = State.OFFLINE) // Reset the state when things go wrong

    try {
      // Bind emitters, We don't care about the ICE connection state nor signaling, only ICE gathering & overall connection state
      this.connection.addEventListener('icegatheringstatechange', this.iceGatheringStateChange)
      this.connection.addEventListener('negotiationneeded', this.negotiationNeeded)
      this.connection.addEventListener('icecandidateerror', event => this.warnings.push(event))
      this.connection.addEventListener('connectionstatechange', this.connectionStateChange)
      this.connection.addEventListener('datachannel', ({ channel }) => this.bindChannel(channel))

      // Sometimes creation can fail with a bad config.
      this.connection.setConfiguration({ iceServers: [{ urls }] })
    } catch (e) {
      this.fail('Unable to create a RTC Connection', e)
    }
  }

  /** Sends some data through the channel. */
  send(data: Sendable) {
    if (this.state != State.CONNECTED)
      throw Error('Unable to send data before a channel has been established.')

    let size = 0
    if (typeof data == 'string')
      size = data.length
    else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data))
      size = data.byteLength
    else if (data instanceof Blob)
      size = data.size

    if (1 > size || size > this.connection.sctp!.maxMessageSize)
      throw Error(`Attempted to send ${size} bytes. This channel supports between 1 & ${this.connection.sctp!.maxMessageSize} bytes.`)

    // @ts-ignore stupid type overloads in `lib.dom.d.ts`
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
    const readyToOffer = filterValue(this.statusChange, State.CAN_OFFER)
    if (!this.channel)
      this.bindChannel(this.connection.createDataChannel(''))
    return readyToOffer.then(() => this.createSDP(this.connection.createOffer.bind(this.connection)))
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
      this.fail('Unable to accept SDP', e)
    }
  }

  private async createSDP(description: RTCPeerConnection['createOffer' | 'createAnswer']) {
    try {
      if (this.state == State.OFFLINE || this.state == State.CAN_OFFER) {
        this.connection.setLocalDescription(await description({
          iceRestart: true, // Forces refresh of candidates
          offerToReceiveAudio: false,
          offerToReceiveVideo: false,
          voiceActivityDetection: false,
        }))

        // The offer is useless until we have gathered all ICE.
        await filterValue(this.statusChange, State.READY)
      }

      return this.connection.localDescription!
    } catch (e) {
      this.fail('Unable to create SDP', e)
      throw e // rethrow so the caller knows
    }
  }

  /** Binds the emitters to the channel. */
  private bindChannel(channel: RTCDataChannel) {
    if (this.channel)
      this.fail('Can not rebind a new data channel.')
    else
      this.channel = channel

    channel.binaryType = 'arraybuffer'
    channel.addEventListener('open', () => this.statusChange.activate(State.CONNECTED))
    channel.addEventListener('message', ({ data }: MessageEvent) => this.message.activate(data))
    channel.addEventListener('error', ({ error }: RTCErrorEvent) => this.fail('Data channel broken', error))
    channel.addEventListener('close', this.close)
  }

  private iceGatheringStateChange = () => {
    switch (this.connection.iceGatheringState) {
      case 'gathering':
        return this.statusChange.activate(State.CONNECTING)

      case 'complete':
        if (this.connection.sctp) {
          // Verify the RTCSctpTransport https://developer.mozilla.org/en-US/docs/Web/API/RTCSctpTransport
          if (this.connection.sctp.state == 'closed')
            this.statusChange.activate(State.OFFLINE).cancel()

          // Only care about errors on the RTCDtlsTransport https://developer.mozilla.org/en-US/docs/Web/API/RTCDtlsTransport
          this.connection.sctp.transport.addEventListener('error', ({ error }) => this.fail('SCTP transport broken', error))

          // RTCIceTransport state https://developer.mozilla.org/en-US/docs/Web/API/RTCIceTransport/state
          this.connection.sctp.transport.iceTransport.addEventListener('statechange', () =>
            this.connection.sctp!.transport.iceTransport.state == 'failed' &&
            this.fail('The ICE Transport protocol has failed'))

          // Ideally, we don't need to listen to the states for RTCDtlsTransport & RTCIceTransport
          // since it should be handled by the`PeerConnection.connectionState`, but that seems unreliable...

          // We are ready, unless something failed...
          this.statusChange.activate(State.READY)
        } else
          this.fail('STCP Transport protocol should be set once gathering state is complete')
        return
    }
  }

  /**
   * Something changed with our connection state.
   * This is meant to be a combination of the ICE and DTLS Transport states.
   */
  private connectionStateChange = () => {
    switch (this.connection.connectionState) {
      case 'new':
        return this.statusChange.activate(State.OFFLINE)

      case 'disconnected': // RTC should be able to recover after some time.
      case 'failed':
        return this.warnings.push(`The connection state is ${this.connection.connectionState} however, an alternate path to the peer may work.`)

      case 'closed':
        return this.statusChange.activate(State.OFFLINE).cancel()

      // Let the channel opening handle connected event.
    }
  }

  /** Close if we have already gone too far in the process. */
  private negotiationNeeded: NonNullable<RTCPeerConnection['onnegotiationneeded']> =
    () => this.state == State.OFFLINE
      ? this.statusChange.activate(State.CAN_OFFER)
      : this.warnings.push(Error(`Negotiation is needed as the offerer when in state ${State.OFFLINE}, unexpected state ${this.state}`))
  
  /** Forcibly ends this RTC connection. */
  private fail(message: string, error: Error & Partial<{ warnings: any[], layman: string }> = Error(message)) {
    console.warn(arguments)
    error.layman = message
    error.warnings = this.warnings
    this.statusChange.deactivate(error)
    this.close()
  }
}
