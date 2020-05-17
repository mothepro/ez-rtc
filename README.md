# EZ RTC

> Simplify the data Peer to Peer (RTC) connenctions in browser

View the [Compatibility](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/RTCPeerConnection#Browser_compatibility) to see which browsers support this.

## Install

`yarn add @mothepro/ez-rtc`

## How to Use

+ Create an offer on the first browser
+ Copy offer and send to the second browser
+ Paste offer in second browser and click Join
+ Create an answer on the second browser
+ Copy answer and send to the first browser
+ Paste answer in first browser and click Join
+ Messages can now be sent between browsers

See the demo for a simple how-to

Note: Browsers may not send empty messages

## Roadmap

Add support for video & audio calls
Possibly support unreliable mode
Support multiple data channels
Support [negotiated](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createDataChannel#negotiated) data channel creation
