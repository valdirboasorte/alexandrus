using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace AlexandrusPonte
{
    public class Server
    {
        public const string Version = "0.1.0";
        readonly int port;
        readonly HashSet<string> origins;
        readonly bool allowNoOrigin;
        readonly object curLock = new object();
        Client current;
        static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

        public Server(int port, HashSet<string> origins, bool allowNoOrigin)
        {
            this.port = port; this.origins = origins; this.allowNoOrigin = allowNoOrigin;
        }

        public static string ToJson(object o) { return Json.Serialize(o); }

        public void Run()
        {
            TcpListener l = new TcpListener(IPAddress.Loopback, port);
            l.Start();
            try { Console.Title = "Alexandrus Ponte"; } catch (Exception) { }
            Console.WriteLine("Alexandrus Ponte " + Version + " — ouvindo em ws://127.0.0.1:" + port);
            Console.WriteLine();
            Console.WriteLine("  Pronto! Deixe esta janela aberta (pode minimizar) e volte ao Alexandrus.");
            Console.WriteLine("  Na sala, escolha \"Jogo ou aplicativo\": a Ponte aparece sozinha.");
            Console.WriteLine("  Para desligar, feche esta janela.");
            Console.WriteLine();
            while (true)
            {
                TcpClient tc = l.AcceptTcpClient();
                Thread t = new Thread(delegate () { HandleSocket(tc); });
                t.IsBackground = true;
                t.Start();
            }
        }

        static void HttpReply(NetworkStream s, string status, string body)
        {
            byte[] b = Encoding.UTF8.GetBytes(body);
            string head = "HTTP/1.1 " + status + "\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: " + b.Length + "\r\nConnection: close\r\n\r\n";
            byte[] h = Encoding.ASCII.GetBytes(head);
            s.Write(h, 0, h.Length); s.Write(b, 0, b.Length); s.Flush();
        }

        static void CorsReply(NetworkStream s, string origin, string status, string json)
        {
            byte[] b = Encoding.UTF8.GetBytes(json ?? "");
            string head = "HTTP/1.1 " + status +
                "\r\nAccess-Control-Allow-Origin: " + origin +
                "\r\nAccess-Control-Allow-Methods: GET" +
                "\r\nAccess-Control-Allow-Private-Network: true" +
                "\r\nVary: Origin\r\nCache-Control: no-store" +
                (json != null ? "\r\nContent-Type: application/json; charset=utf-8" : "") +
                "\r\nContent-Length: " + b.Length + "\r\nConnection: close\r\n\r\n";
            byte[] h = Encoding.ASCII.GetBytes(head);
            s.Write(h, 0, h.Length);
            if (b.Length > 0) s.Write(b, 0, b.Length);
            s.Flush();
        }

        string StatusJson()
        {
            Client c;
            lock (curLock) { c = current; }
            Dictionary<string, object> d = new Dictionary<string, object>();
            d["app"] = "alexandrus-ponte";
            d["version"] = Version;
            int build = Native.WindowsBuild();
            d["windowsBuild"] = build;
            d["processLoopback"] = build >= 19041;
            d["connected"] = c != null;
            d["capturing"] = c != null && c.Capturing;
            return ToJson(d);
        }

        void HandleSocket(TcpClient tc)
        {
            NetworkStream ns = null;
            try
            {
                tc.NoDelay = true;
                ns = tc.GetStream();
                string head = WsConnection.ReadHead(ns);
                if (head == null) { tc.Close(); return; }
                string[] lines = head.Split(new string[] { "\r\n" }, StringSplitOptions.RemoveEmptyEntries);
                Dictionary<string, string> hd = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                for (int i = 1; i < lines.Length; i++)
                {
                    int c = lines[i].IndexOf(':');
                    if (c > 0) hd[lines[i].Substring(0, c).Trim()] = lines[i].Substring(c + 1).Trim();
                }
                string up; hd.TryGetValue("Upgrade", out up);
                string origin; hd.TryGetValue("Origin", out origin);
                bool ok = origin == null ? allowNoOrigin : origins.Contains(origin);
                if (up == null || up.ToLowerInvariant() != "websocket")
                {
                    // GET /status: o site consulta a Ponte sem abrir um WebSocket
                    // (um segundo WebSocket derrubaria a captura em andamento).
                    string[] reqLine = lines.Length > 0 ? lines[0].Split(' ') : new string[0];
                    string method = reqLine.Length > 0 ? reqLine[0] : "";
                    string path = reqLine.Length > 1 ? reqLine[1] : "/";
                    if (origin != null && !ok)
                    {
                        // página de outro site: nem confirma que a Ponte existe
                        HttpReply(ns, "403 Forbidden", "Origin nao permitida");
                        tc.Close(); return;
                    }
                    if (path == "/status" && origin != null)
                    {
                        if (method == "OPTIONS") { CorsReply(ns, origin, "204 No Content", null); }
                        else { CorsReply(ns, origin, "200 OK", StatusJson()); }
                        tc.Close(); return;
                    }
                    HttpReply(ns, "200 OK", "Alexandrus Ponte " + Version);
                    tc.Close(); return;
                }
                if (!ok)
                {
                    Console.WriteLine("Origem recusada: " + (origin ?? "(nenhuma)"));
                    HttpReply(ns, "403 Forbidden", "Origin nao permitida");
                    tc.Close(); return;
                }
                string key, ver;
                hd.TryGetValue("Sec-WebSocket-Key", out key);
                hd.TryGetValue("Sec-WebSocket-Version", out ver);
                if (string.IsNullOrEmpty(key) || ver != "13")
                {
                    HttpReply(ns, "400 Bad Request", "Requisicao invalida");
                    tc.Close(); return;
                }
                string resp = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + WsConnection.AcceptKey(key) + "\r\n\r\n";
                byte[] rb = Encoding.ASCII.GetBytes(resp);
                ns.Write(rb, 0, rb.Length); ns.Flush();

                Client cl = new Client(new WsConnection(ns), origin ?? "(sem origem)");
                Client old;
                lock (curLock) { old = current; current = cl; }
                if (old != null) old.Replace();
                Console.WriteLine("Conectado: " + cl.Origin);
                cl.Run();
                cl.Dispose();
                lock (curLock) { if (current == cl) current = null; }
                Console.WriteLine("Desconectado: " + cl.Origin);
            }
            catch (Exception) { }
            try { tc.Close(); } catch (Exception) { }
        }
    }

    class Client
    {
        readonly WsConnection ws;
        public readonly string Origin;
        Capture cap;
        readonly object capLock = new object();

        public Client(WsConnection w, string origin) { ws = w; Origin = origin; }

        static Dictionary<string, object> Msg(string t) { Dictionary<string, object> d = new Dictionary<string, object>(); d["t"] = t; return d; }

        void Send(Dictionary<string, object> d) { try { ws.SendText(Server.ToJson(d)); } catch (Exception) { } }

        void Err(string code, string message)
        {
            Dictionary<string, object> d = Msg("error"); d["code"] = code; d["message"] = message; Send(d);
        }

        void Stopped(string reason) { Dictionary<string, object> d = Msg("stopped"); d["reason"] = reason; Send(d); }

        public bool Capturing { get { lock (capLock) { return cap != null; } } }

        public void Replace()
        {
            bool was = StopCapture();
            if (was) Stopped("replaced");
            ws.Close();
        }

        bool StopCapture()
        {
            Capture c;
            lock (capLock) { c = cap; cap = null; }
            if (c == null) return false;
            c.Stop();
            Console.WriteLine("Captura encerrada (PID " + c.Pid + ")");
            return true;
        }

        public void Dispose() { StopCapture(); ws.Close(); }

        public void Run()
        {
            while (true)
            {
                string text;
                try { text = ws.ReadText(); } catch (Exception) { return; }
                if (text == null) return;
                try { Handle(text); }
                catch (PonteException pe) { Err(pe.Code, pe.Message); }
                catch (Exception ex) { Err("bad-request", "Requisição inválida: " + ex.Message); }
            }
        }

        void Handle(string text)
        {
            Dictionary<string, object> m = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(text);
            object to; if (m == null || !m.TryGetValue("t", out to) || !(to is string)) throw new PonteException("bad-request", "Mensagem sem campo 't'.");
            string t = (string)to;
            if (t == "hello")
            {
                int build = Native.WindowsBuild();
                Dictionary<string, object> d = Msg("hello");
                d["app"] = "alexandrus-ponte"; d["version"] = Server.Version; d["windowsBuild"] = build; d["processLoopback"] = build >= 19041;
                Send(d);
            }
            else if (t == "ping") Send(Msg("pong"));
            else if (t == "list")
            {
                List<object> items = new List<object>();
                foreach (SessionInfo s in Sessions.List()) items.Add(SessionDict(s));
                Dictionary<string, object> d = Msg("sessions"); d["items"] = items; Send(d);
            }
            else if (t == "stop")
            {
                StopCapture();
                Stopped("requested");
            }
            else if (t == "start")
            {
                object po, mo; m.TryGetValue("pid", out po); m.TryGetValue("mode", out mo);
                if (!(po is int) || (int)po <= 0) throw new PonteException("bad-request", "Campo 'pid' inválido.");
                string mode = mo as string;
                if (mode != "include" && mode != "exclude") throw new PonteException("bad-request", "Campo 'mode' deve ser 'include' ou 'exclude'.");
                int pid = (int)po;
                StopCapture();
                Capture c = null;
                c = new Capture(pid, mode == "exclude", delegate (byte[] b)
                {
                    try { ws.SendBinary(b); } catch (Exception) { }
                }, delegate (string reason)
                {
                    bool mine;
                    lock (capLock) { mine = (cap == c); if (mine) cap = null; }
                    if (mine) { Stopped(reason); Console.WriteLine("Captura terminou: " + reason); }
                });
                c.Start();
                lock (capLock) { cap = c; }
                Dictionary<string, object> d = Msg("started");
                d["pid"] = pid; d["name"] = c.Name; d["mode"] = mode; d["sampleRate"] = 48000; d["channels"] = 2; d["format"] = "s16le";
                Send(d);
                Console.WriteLine("Capturando áudio de " + c.Name + " (PID " + pid + ")");
            }
            else throw new PonteException("bad-request", "Tipo de mensagem desconhecido: " + t);
        }

        public static Dictionary<string, object> SessionDict(SessionInfo s)
        {
            Dictionary<string, object> d = new Dictionary<string, object>();
            d["pid"] = s.Pid; d["name"] = s.Name; d["title"] = s.Title; d["state"] = s.State; d["isSystemSounds"] = s.IsSystemSounds;
            return d;
        }
    }
}
