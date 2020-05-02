import iceServers from './ice-servers.json'
import Connection, { State } from '../index.js'

// Elements on the HTML page
export const logPre = document.getElementById('log') as HTMLPreElement
export const createOfferBtn = document.getElementById('createOffer') as HTMLButtonElement
export const createAnswerBtn = document.getElementById('createAnswer') as HTMLButtonElement
export const sdpInput = document.getElementById('sdp') as HTMLInputElement
export const joinBtn = document.getElementById('join') as HTMLButtonElement
export const sendBtn = document.getElementById('send') as HTMLButtonElement

// Helper methods
export const log = (...args: any[]) =>
  logPre.innerHTML += `${args.length}> ${args.join('\t')}\n`

export const logErr = ({ message, name, ...err }: Error) =>
  logPre.innerHTML += `${name || 'Error'}> ${message} ${JSON.stringify(err, null, 2)}\n`

// The connection!
const connection = new Connection(iceServers)

connection.message.on((data: any) => log('New message', data))
connection.statusChange.on(state => {
  log('State updated to', state)
  if (state == State.CONNECTED)
    sdpInput.value = ''
}).catch(logErr)


createOfferBtn.onclick = async () => log('offer', JSON.stringify(await connection.createOffer()))

createAnswerBtn.onclick = async () => log('answer', JSON.stringify(await connection.createAnswer()))

joinBtn.onclick = async () => {
  log('attempting to accept SDP', sdpInput.value)
  await connection.acceptSDP(JSON.parse(sdpInput.value))
}

sendBtn.onclick = () => {
  connection.send(sdpInput.value)
  sdpInput.value = ''
}
