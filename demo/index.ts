import iceServers from './ice-servers.json'
import Connection, { State } from '../index.js'

const // Elements on the HTML page
  logPre = document.getElementById('log') as HTMLPreElement,
  createOfferBtn = document.getElementById('createOffer') as HTMLButtonElement,
  createAnswerBtn = document.getElementById('createAnswer') as HTMLButtonElement,
  sdpInput = document.getElementById('sdp') as HTMLInputElement,
  joinBtn = document.getElementById('join') as HTMLButtonElement,
  sendBtn = document.getElementById('send') as HTMLButtonElement,

  // Helper methods
  log = (...args: any[]) => logPre.innerHTML += `${args.join('\t')}\n\n`,
  logErr = ({ name, stack, message, ...err }: Error) => logPre.innerHTML += 
    `<details style="color: darkred">
      <summary><b>${name ?? 'Error'}</b> ${stack ?? message}</summary>${
      JSON.stringify({ ...err }, null, 2)
    }</details>`,
  escapeHtml = (unsafe: string) => unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;"),

  // The connection!
  connection = new Connection(iceServers)

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
