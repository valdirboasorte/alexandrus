using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;

namespace AlexandrusPonte
{
    public class WsConnection
    {
        public const int MaxMessage = 64 * 1024;
        readonly NetworkStream stream;
        readonly object writeLock = new object();
        public bool Closed;

        public WsConnection(NetworkStream s) { stream = s; }

        static bool ReadExact(Stream s, byte[] buf, int n)
        {
            int off = 0;
            while (off < n)
            {
                int r = s.Read(buf, off, n - off);
                if (r <= 0) return false;
                off += r;
            }
            return true;
        }

        // Returns text message, or null on close/error. Binary frames are ignored.
        public string ReadText()
        {
            MemoryStream msg = null;
            bool msgIsText = false;
            byte[] h = new byte[2];
            while (true)
            {
                if (!ReadExact(stream, h, 2)) return null;
                bool fin = (h[0] & 0x80) != 0;
                int op = h[0] & 0x0F;
                bool masked = (h[1] & 0x80) != 0;
                long len = h[1] & 0x7F;
                if (len == 126) { byte[] e = new byte[2]; if (!ReadExact(stream, e, 2)) return null; len = (e[0] << 8) | e[1]; }
                else if (len == 127)
                {
                    byte[] e = new byte[8]; if (!ReadExact(stream, e, 8)) return null;
                    len = 0; for (int i = 0; i < 8; i++) len = (len << 8) | e[i];
                }
                if (len < 0 || len > MaxMessage) return null;
                byte[] mask = new byte[4];
                if (masked && !ReadExact(stream, mask, 4)) return null;
                byte[] payload = new byte[len];
                if (len > 0 && !ReadExact(stream, payload, (int)len)) return null;
                if (masked) for (int i = 0; i < payload.Length; i++) payload[i] ^= mask[i & 3];

                if (op == 0x8) { try { WriteFrame(0x8, payload); } catch (Exception) { } return null; }
                if (op == 0x9) { WriteFrame(0xA, payload); continue; }
                if (op == 0xA) continue;
                if (op == 0x1 || op == 0x2)
                {
                    msg = new MemoryStream(); msgIsText = op == 0x1;
                }
                else if (op != 0x0) return null;
                if (msg == null) return null;
                if (msg.Length + payload.Length > MaxMessage) return null;
                msg.Write(payload, 0, payload.Length);
                if (fin)
                {
                    if (msgIsText) return Encoding.UTF8.GetString(msg.ToArray());
                    msg = null;
                }
            }
        }

        public void WriteFrame(int opcode, byte[] payload)
        {
            lock (writeLock)
            {
                if (Closed) return;
                byte[] header;
                int n = payload.Length;
                if (n < 126) header = new byte[] { (byte)(0x80 | opcode), (byte)n };
                else if (n <= 0xFFFF) header = new byte[] { (byte)(0x80 | opcode), 126, (byte)(n >> 8), (byte)n };
                else
                {
                    header = new byte[10];
                    header[0] = (byte)(0x80 | opcode); header[1] = 127;
                    long l = n;
                    for (int i = 0; i < 8; i++) header[9 - i] = (byte)(l >> (8 * i));
                }
                stream.Write(header, 0, header.Length);
                if (n > 0) stream.Write(payload, 0, n);
                stream.Flush();
            }
        }

        public void SendText(string s) { WriteFrame(0x1, Encoding.UTF8.GetBytes(s)); }
        public void SendBinary(byte[] b) { WriteFrame(0x2, b); }

        public void Close()
        {
            lock (writeLock)
            {
                if (Closed) return;
                try { stream.Write(new byte[] { 0x88, 0x00 }, 0, 2); } catch (Exception) { }
                Closed = true;
            }
            try { stream.Close(); } catch (Exception) { }
        }

        public static string AcceptKey(string key)
        {
            using (SHA1 sha = SHA1.Create())
                return Convert.ToBase64String(sha.ComputeHash(Encoding.ASCII.GetBytes(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));
        }

        // Reads HTTP request head; returns null on failure.
        public static string ReadHead(NetworkStream s)
        {
            MemoryStream ms = new MemoryStream();
            byte[] one = new byte[1];
            while (ms.Length < 16384)
            {
                int r = s.Read(one, 0, 1);
                if (r <= 0) return null;
                ms.WriteByte(one[0]);
                byte[] a = ms.GetBuffer();
                long l = ms.Length;
                if (l >= 4 && a[l - 4] == 13 && a[l - 3] == 10 && a[l - 2] == 13 && a[l - 1] == 10)
                    return Encoding.ASCII.GetString(a, 0, (int)l);
            }
            return null;
        }
    }
}
