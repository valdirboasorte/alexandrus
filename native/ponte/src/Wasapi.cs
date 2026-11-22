using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

namespace AlexandrusPonte
{
    public class PonteException : Exception
    {
        public string Code;
        public PonteException(string code, string message) : base(message) { Code = code; }
    }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
        [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
        [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
        [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr client);
        [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr client);
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    class MMDeviceEnumeratorClass { }

    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceCollection
    {
        [PreserveSig] int GetCount(out uint count);
        [PreserveSig] int Item(uint index, out IMMDevice device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
        [PreserveSig] int OpenPropertyStore(int access, out IntPtr props);
        [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig] int GetState(out int state);
    }

    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionManager2
    {
        [PreserveSig] int GetAudioSessionControl(IntPtr g, uint flags, out IntPtr ctl);
        [PreserveSig] int GetSimpleAudioVolume(IntPtr g, uint flags, out IntPtr vol);
        [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator e);
    }

    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionEnumerator
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int GetSession(int index, [MarshalAs(UnmanagedType.IUnknown)] out object session);
    }

    [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionControl2
    {
        [PreserveSig] int GetState(out int state);
        [PreserveSig] int GetDisplayName(out IntPtr s);
        [PreserveSig] int SetDisplayName(IntPtr s, IntPtr ctx);
        [PreserveSig] int GetIconPath(out IntPtr s);
        [PreserveSig] int SetIconPath(IntPtr s, IntPtr ctx);
        [PreserveSig] int GetGroupingParam(out Guid g);
        [PreserveSig] int SetGroupingParam(ref Guid g, IntPtr ctx);
        [PreserveSig] int RegisterAudioSessionNotification(IntPtr n);
        [PreserveSig] int UnregisterAudioSessionNotification(IntPtr n);
        [PreserveSig] int GetSessionIdentifier(out IntPtr s);
        [PreserveSig] int GetSessionInstanceIdentifier(out IntPtr s);
        [PreserveSig] int GetProcessId(out uint pid);
        [PreserveSig] int IsSystemSoundsSession();
        [PreserveSig] int SetDuckingPreference(int optOut);
    }

    [ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioClient
    {
        [PreserveSig] int Initialize(int shareMode, uint flags, long hnsBufferDuration, long hnsPeriodicity, IntPtr format, IntPtr sessionGuid);
        [PreserveSig] int GetBufferSize(out uint frames);
        [PreserveSig] int GetStreamLatency(out long latency);
        [PreserveSig] int GetCurrentPadding(out uint padding);
        [PreserveSig] int IsFormatSupported(int shareMode, IntPtr format, out IntPtr closest);
        [PreserveSig] int GetMixFormat(out IntPtr format);
        [PreserveSig] int GetDevicePeriod(out long def, out long min);
        [PreserveSig] int Start();
        [PreserveSig] int Stop();
        [PreserveSig] int Reset();
        [PreserveSig] int SetEventHandle(IntPtr handle);
        [PreserveSig] int GetService(ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object service);
    }

    [ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioCaptureClient
    {
        [PreserveSig] int GetBuffer(out IntPtr data, out int frames, out int flags, out long devPos, out long qpc);
        [PreserveSig] int ReleaseBuffer(int frames);
        [PreserveSig] int GetNextPacketSize(out int frames);
    }

    [ComImport, Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IActivateAudioInterfaceAsyncOperation
    {
        [PreserveSig] int GetActivateResult(out int activateResult, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
    }

    [ComImport, Guid("41D949AB-9862-444A-80F6-C261334DA5EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IActivateAudioInterfaceCompletionHandler
    {
        [PreserveSig] int ActivateCompleted(IActivateAudioInterfaceAsyncOperation op);
    }

    [ComImport, Guid("94ea2b94-e9cc-49e0-c0ff-ee64ca8f5b90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAgileObject { }

    [StructLayout(LayoutKind.Explicit, Size = 24)]
    struct PropVariantBlob
    {
        [FieldOffset(0)] public ushort vt;
        [FieldOffset(8)] public uint cbSize;
        [FieldOffset(16)] public IntPtr pBlobData;
    }

    class ActivationHandler : IActivateAudioInterfaceCompletionHandler, IAgileObject
    {
        public ManualResetEvent Done = new ManualResetEvent(false);
        public int Hr;
        public object Iface;
        public int ActivateCompleted(IActivateAudioInterfaceAsyncOperation op)
        {
            int hr = 0; object o = null;
            int r = op.GetActivateResult(out hr, out o);
            if (r < 0) hr = r;
            Hr = hr; Iface = o;
            Done.Set();
            return 0;
        }
    }

    public class SessionInfo
    {
        public int Pid;
        public string Name;
        public string Title;
        public string State;
        public bool IsSystemSounds;
    }

    static class Native
    {
        [DllImport("Mmdevapi.dll", ExactSpelling = true, PreserveSig = false)]
        public static extern void ActivateAudioInterfaceAsync(
            [MarshalAs(UnmanagedType.LPWStr)] string devicePath, ref Guid riid, IntPtr activationParams,
            IActivateAudioInterfaceCompletionHandler handler, out IActivateAudioInterfaceAsyncOperation op);

        [StructLayout(LayoutKind.Sequential)]
        public struct OSVERSIONINFOEX
        {
            public int dwOSVersionInfoSize; public int dwMajorVersion; public int dwMinorVersion; public int dwBuildNumber; public int dwPlatformId;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string szCSDVersion;
            public ushort wServicePackMajor, wServicePackMinor, wSuiteMask; public byte wProductType, wReserved;
        }
        [DllImport("ntdll.dll")]
        public static extern int RtlGetVersion(ref OSVERSIONINFOEX v);

        public static int WindowsBuild()
        {
            try
            {
                OSVERSIONINFOEX v = new OSVERSIONINFOEX();
                v.dwOSVersionInfoSize = Marshal.SizeOf(typeof(OSVERSIONINFOEX));
                RtlGetVersion(ref v);
                return v.dwBuildNumber;
            }
            catch (Exception) { return 0; }
        }
    }

    public static class Sessions
    {
        static int Rank(string s) { return s == "active" ? 2 : (s == "inactive" ? 1 : 0); }

        public static List<SessionInfo> List()
        {
            Dictionary<int, SessionInfo> map = new Dictionary<int, SessionInfo>();
            int self = Process.GetCurrentProcess().Id;
            IMMDeviceEnumerator en = (IMMDeviceEnumerator)new MMDeviceEnumeratorClass();
            IMMDeviceCollection col;
            if (en.EnumAudioEndpoints(0, 1, out col) < 0 || col == null) return new List<SessionInfo>();
            uint n; col.GetCount(out n);
            Guid iidMgr = typeof(IAudioSessionManager2).GUID;
            for (uint i = 0; i < n; i++)
            {
                try
                {
                    IMMDevice dev; if (col.Item(i, out dev) < 0) continue;
                    object mgrObj;
                    if (dev.Activate(ref iidMgr, 23, IntPtr.Zero, out mgrObj) < 0) continue;
                    IAudioSessionManager2 mgr = (IAudioSessionManager2)mgrObj;
                    IAudioSessionEnumerator se; if (mgr.GetSessionEnumerator(out se) < 0) continue;
                    int cnt; se.GetCount(out cnt);
                    for (int j = 0; j < cnt; j++)
                    {
                        object so;
                        if (se.GetSession(j, out so) < 0) continue;
                        IAudioSessionControl2 c = so as IAudioSessionControl2;
                        if (c == null) continue;
                        uint pid; c.GetProcessId(out pid);
                        bool sys = c.IsSystemSoundsSession() == 0;
                        int st; c.GetState(out st);
                        string state = st == 1 ? "active" : (st == 0 ? "inactive" : "expired");
                        if (pid == 0 || (int)pid == self) continue;
                        SessionInfo ex;
                        if (map.TryGetValue((int)pid, out ex))
                        {
                            if (Rank(state) > Rank(ex.State)) ex.State = state;
                            continue;
                        }
                        SessionInfo si = new SessionInfo();
                        si.Pid = (int)pid; si.State = state; si.IsSystemSounds = sys; si.Name = "pid" + pid + ".exe"; si.Title = "";
                        try
                        {
                            Process p = Process.GetProcessById((int)pid);
                            si.Name = p.ProcessName + ".exe";
                            try { si.Title = p.MainWindowTitle ?? ""; } catch (Exception) { si.Title = ""; }
                        }
                        catch (Exception) { }
                        map[(int)pid] = si;
                    }
                }
                catch (Exception) { }
            }
            List<SessionInfo> res = new List<SessionInfo>(map.Values);
            res.Sort(delegate (SessionInfo a, SessionInfo b)
            {
                int r = Rank(b.State).CompareTo(Rank(a.State));
                if (r != 0) return r;
                return string.Compare(a.Name, b.Name, StringComparison.OrdinalIgnoreCase);
            });
            return res;
        }
    }

    public class Capture
    {
        public int Pid;
        public string Name;
        public bool Exclude;
        Action<byte[]> onData;
        Action<string> onEnded;
        IAudioClient client;
        IAudioCaptureClient cap;
        AutoResetEvent evt = new AutoResetEvent(false);
        volatile bool stopRequested;
        Thread thread;
        Process proc;

        public Capture(int pid, bool exclude, Action<byte[]> onData, Action<string> onEnded)
        {
            Pid = pid; Exclude = exclude; this.onData = onData; this.onEnded = onEnded;
        }

        static string Hex(int hr) { return "0x" + ((uint)hr).ToString("X8"); }

        public void Start()
        {
            try { proc = Process.GetProcessById(Pid); Name = proc.ProcessName + ".exe"; }
            catch (Exception) { throw new PonteException("process-not-found", "Processo " + Pid + " não encontrado."); }

            IntPtr prms = Marshal.AllocHGlobal(12);
            IntPtr pv = Marshal.AllocHGlobal(24);
            try
            {
                Marshal.WriteInt32(prms, 0, 1);
                Marshal.WriteInt32(prms, 4, Pid);
                Marshal.WriteInt32(prms, 8, Exclude ? 1 : 0);
                PropVariantBlob b = new PropVariantBlob();
                b.vt = 65; b.cbSize = 12; b.pBlobData = prms;
                Marshal.StructureToPtr(b, pv, false);

                ActivationHandler h = new ActivationHandler();
                Guid iid = typeof(IAudioClient).GUID;
                IActivateAudioInterfaceAsyncOperation op;
                try { Native.ActivateAudioInterfaceAsync("VAD\\Process_Loopback", ref iid, pv, h, out op); }
                catch (COMException ce) { throw new PonteException("activation-failed", "Falha ao ativar a captura por processo (HRESULT " + Hex(ce.ErrorCode) + ")."); }
                catch (DllNotFoundException) { throw new PonteException("activation-failed", "Captura por processo indisponível neste Windows (Mmdevapi.dll)."); }
                if (!h.Done.WaitOne(5000)) throw new PonteException("activation-failed", "Tempo esgotado ao ativar a captura (HRESULT 0x80004005).");
                if (h.Hr < 0 || h.Iface == null) throw new PonteException("activation-failed", "Falha ao ativar a captura por processo (HRESULT " + Hex(h.Hr) + ").");
                client = (IAudioClient)h.Iface;
            }
            finally { Marshal.FreeHGlobal(pv); Marshal.FreeHGlobal(prms); }

            IntPtr fmt = Marshal.AllocHGlobal(18);
            try
            {
                Marshal.WriteInt16(fmt, 0, 1);
                Marshal.WriteInt16(fmt, 2, 2);
                Marshal.WriteInt32(fmt, 4, 48000);
                Marshal.WriteInt32(fmt, 8, 192000);
                Marshal.WriteInt16(fmt, 12, 4);
                Marshal.WriteInt16(fmt, 14, 16);
                Marshal.WriteInt16(fmt, 16, 0);
                uint flags = 0x00020000u | 0x00040000u | 0x80000000u | 0x08000000u;
                int hr = client.Initialize(0, flags, 200000, 0, fmt, IntPtr.Zero);
                if (hr < 0) { Cleanup(); throw new PonteException("capture-failed", "Falha ao inicializar a captura (HRESULT " + Hex(hr) + ")."); }
            }
            finally { Marshal.FreeHGlobal(fmt); }

            int hr2 = client.SetEventHandle(evt.SafeWaitHandle.DangerousGetHandle());
            if (hr2 < 0) { Cleanup(); throw new PonteException("capture-failed", "Falha ao configurar evento (HRESULT " + Hex(hr2) + ")."); }
            Guid gcc = typeof(IAudioCaptureClient).GUID;
            object so;
            hr2 = client.GetService(ref gcc, out so);
            if (hr2 < 0 || so == null) { Cleanup(); throw new PonteException("capture-failed", "Falha ao obter o cliente de captura (HRESULT " + Hex(hr2) + ")."); }
            cap = (IAudioCaptureClient)so;
            hr2 = client.Start();
            if (hr2 < 0) { Cleanup(); throw new PonteException("capture-failed", "Falha ao iniciar a captura (HRESULT " + Hex(hr2) + ")."); }

            thread = new Thread(Loop);
            thread.IsBackground = true;
            thread.Name = "ponte-capture";
            thread.Start();
        }

        void Loop()
        {
            string reason = null;
            try
            {
                while (!stopRequested)
                {
                    evt.WaitOne(100);
                    if (stopRequested) break;
                    int frames;
                    while (!stopRequested && cap.GetNextPacketSize(out frames) >= 0 && frames > 0)
                    {
                        IntPtr data; int fr; int flags; long dp, qpc;
                        if (cap.GetBuffer(out data, out fr, out flags, out dp, out qpc) < 0) break;
                        byte[] buf = new byte[fr * 4];
                        if ((flags & 2) == 0 && fr > 0) Marshal.Copy(data, buf, 0, buf.Length);
                        cap.ReleaseBuffer(fr);
                        if (fr > 0) onData(buf);
                    }
                    if (!Exclude)
                    {
                        bool exited = false;
                        try { exited = proc.HasExited; } catch (Exception) { }
                        if (exited) { reason = "process-exited"; break; }
                    }
                }
            }
            catch (Exception) { if (!stopRequested) reason = "error"; }
            Cleanup();
            if (reason != null && !stopRequested && onEnded != null) onEnded(reason);
        }

        void Cleanup()
        {
            try { if (client != null) client.Stop(); } catch (Exception) { }
            try { if (cap != null) Marshal.ReleaseComObject(cap); } catch (Exception) { }
            try { if (client != null) Marshal.ReleaseComObject(client); } catch (Exception) { }
            cap = null; client = null;
        }

        public void Stop()
        {
            stopRequested = true;
            evt.Set();
            if (thread != null && thread != Thread.CurrentThread) thread.Join(2000);
        }
    }
}
