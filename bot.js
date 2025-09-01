import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, DisconnectReason } from "@adiwajshing/baileys"
import axios from "axios"
import config from "./config.js"
import readline from "readline"

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState("session")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false, // pairing mode
    syncFullHistory: false,
  })

  sock.ev.on("creds.update", saveCreds)

  // Jika belum login → generate pairing code
  if (!sock.authState.creds.registered) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question("📲 Masukkan nomor WhatsApp (contoh: 628xxxx): ", async (number) => {
      const code = await sock.requestPairingCode(number.trim())
      console.log(`✅ Pairing code untuk ${number}: ${code}`)
      rl.close()
    })
  }

  // ✅ Handle pesan
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0]
    if (!m.message || m.key.fromMe) return

    const from = m.key.remoteJid
    const type = Object.keys(m.message)[0]
    const text = type === "conversation"
      ? m.message.conversation
      : type === "extendedTextMessage"
      ? m.message.extendedTextMessage.text
      : ""

    if (!text) return

    console.log(`📩 Pesan dari ${from}: ${text}`)

    if (text.toLowerCase() === "ping") {
      await sock.sendMessage(from, { text: "🏓 Pong!" })
    } else {
      try {
        const reply = await askAI(text)
        await sock.sendMessage(from, { text: reply })
      } catch (e) {
        console.error(e)
        await sock.sendMessage(from, { text: "⚠️ Error: AI tidak merespon" })
      }
    }
  })

  // ✅ Handle disconnect
  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "close") {
      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
        connect()
      } else {
        console.log("❌ Logout, hapus folder session dan pairing ulang.")
      }
    } else if (connection === "open") {
      console.log("✅ Bot berhasil terkoneksi!")
    }
  })
}

// 🔥 Fungsi AI
async function askAI(prompt) {
  const res = await axios.post(
    config.ai_api,
    { inputs: prompt },
    { headers: { Authorization: `Bearer ${config.ai_token}` } }
  )
  return res.data[0]?.generated_text || "AI tidak paham 😅"
}

connect()
