using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;

namespace AlexandrusPonte
{
    static class Program
    {
        static int Main(string[] args)
        {
            try { Console.OutputEncoding = new UTF8Encoding(false); } catch (Exception) { }
            int port = 47613;
            bool list = false, noOrigin = false, exclude = false;
            string[] capArgs = null;
            HashSet<string> origins = new HashSet<string>(new string[] {
                "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8790", "http://127.0.0.1:8790" });
            for (int i = 0; i < args.Length; i++)
            {
                string a = args[i];
                if (a == "--port" && i + 1 < args.Length) port = int.Parse(args[++i]);
                else if (a == "--allow-origin" && i + 1 < args.Length) origins.Add(args[++i]);
                else if (a == "--allow-no-origin") noOrigin = true;
                else if (a == "--list") list = true;
                else if (a == "--exclude") exclude = true;
                else if (a == "--capture" && i + 3 < args.Length) { capArgs = new string[] { args[i + 1], args[i + 2], args[i + 3] }; i += 3; }
                else { Console.Error.WriteLine("Argumento desconhecido ou incompleto: " + a); return 2; }
            }
            try
            {
                if (list) return DoList();
                if (capArgs != null) return DoCapture(int.Parse(capArgs[0]), int.Parse(capArgs[1]), capArgs[2], exclude);
                new Server(port, origins, noOrigin).Run();
                return 0;
            }
            catch (PonteException pe) { Console.Error.WriteLine(pe.Code + ": " + pe.Message); return 1; }
            catch (Exception ex) { Console.Error.WriteLine("Erro: " + ex.Message); return 1; }
        }

        static int DoList()
        {
            List<object> items = new List<object>();
            foreach (SessionInfo s in Sessions.List()) items.Add(Client.SessionDict(s));
            Console.WriteLine(Server.ToJson(items));
            return 0;
        }

        static int DoCapture(int pid, int seconds, string path, bool exclude)
        {
            MemoryStream pcm = new MemoryStream();
            int peak = 0;
            object lk = new object();
            Capture c = new Capture(pid, exclude, delegate (byte[] b)
            {
                lock (lk)
                {
                    pcm.Write(b, 0, b.Length);
                    for (int i = 0; i + 1 < b.Length; i += 2)
                    {
                        int v = Math.Abs((int)(short)(b[i] | (b[i + 1] << 8)));
                        if (v > peak) peak = v;
                    }
                }
            }, null);
            c.Start();
            Console.WriteLine("Capturando áudio de " + c.Name + " (PID " + pid + ")");
            Thread.Sleep(seconds * 1000);
            c.Stop();
            byte[] data;
            lock (lk) { data = pcm.ToArray(); }
            using (FileStream fs = new FileStream(path, FileMode.Create))
            using (BinaryWriter w = new BinaryWriter(fs))
            {
                w.Write(Encoding.ASCII.GetBytes("RIFF")); w.Write(36 + data.Length); w.Write(Encoding.ASCII.GetBytes("WAVEfmt "));
                w.Write(16); w.Write((short)1); w.Write((short)2); w.Write(48000); w.Write(192000); w.Write((short)4); w.Write((short)16);
                w.Write(Encoding.ASCII.GetBytes("data")); w.Write(data.Length); w.Write(data);
            }
            Console.WriteLine("peak=" + peak + " bytes=" + data.Length);
            return 0;
        }
    }
}
