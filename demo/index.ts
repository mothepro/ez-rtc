import iceServers from './ice-servers.json'
import Connection, { State } from '../index.js'

// Elements on the HTML page
const logPre = document.getElementById('log') as HTMLPreElement
const createOfferBtn = document.getElementById('createOffer') as HTMLButtonElement
const createAnswerBtn = document.getElementById('createAnswer') as HTMLButtonElement
const sdpInput = document.getElementById('sdp') as HTMLInputElement
const joinBtn = document.getElementById('join') as HTMLButtonElement
const sendBtn = document.getElementById('send') as HTMLButtonElement

// Helper methods
const log = (...args: any[]) => logPre.innerHTML += `${args.join('\t')}\n\n`
const logErr = ({ name, ...err }: Error) =>
  logPre.innerHTML += `<font color="red">${name || 'Error'}> ${JSON.stringify({...err}, null, 2)}\n</font>`
const escapeHtml = (unsafe: string) => unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")

// The connection!
const connection = new Connection(iceServers)

connection.message.on((data: any) => log(escapeHtml(data)))
connection.statusChange.on(state => {
  log('State updated to', state)
  if (state == State.CONNECTED)
    sdpInput.value = ''
}).catch(logErr)


createOfferBtn.addEventListener('click', async () => log(JSON.stringify(await connection.createOffer())))
createAnswerBtn.addEventListener('click', async () => log(JSON.stringify(await connection.createAnswer())))

joinBtn.addEventListener('click', async () => {
  log('attempting to accept SDP', sdpInput.value)
  await connection.acceptSDP(JSON.parse(sdpInput.value))
  log('SDP accepted')
})

sendBtn.addEventListener('click', () => {
  connection.send(sdpInput.value)
  sdpInput.value = ''
})
