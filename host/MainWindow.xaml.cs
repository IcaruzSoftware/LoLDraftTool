using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace LoLDraftTool.Host;

public partial class MainWindow : Window
{
    private const string WebView2DownloadUrl =
        "https://developer.microsoft.com/microsoft-edge/webview2/";

    // Single shared client for the app's only online feature (op.gg fetch).
    private static readonly HttpClient Http = CreateHttpClient();

    private static HttpClient CreateHttpClient()
    {
        var client = new HttpClient();
        client.DefaultRequestHeaders.UserAgent.ParseAdd(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36");
        client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("en");
        return client;
    }

    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        var args = Environment.GetCommandLineArgs().Skip(1).ToArray();
        var devUrl = ResolveDevUrl(args);
        var isDev = devUrl is not null;
        var devTools = isDev || args.Contains("--devtools", StringComparer.OrdinalIgnoreCase);

        try
        {
            var userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "LoLDraftTool", "WebView2");
            Directory.CreateDirectory(userDataFolder);

            var environment = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
            await Web.EnsureCoreWebView2Async(environment);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show(
                "The Microsoft Edge WebView2 Runtime is required to run LoLDraftTool.\n\n" +
                "Please install it from:\n" + WebView2DownloadUrl,
                "WebView2 Runtime missing",
                MessageBoxButton.OK, MessageBoxImage.Error);
            Application.Current.Shutdown();
            return;
        }

        var core = Web.CoreWebView2;
        core.WebMessageReceived += OnWebMessageReceived;
        var settings = core.Settings;
        settings.AreDefaultContextMenusEnabled = devTools;
        settings.AreDevToolsEnabled = devTools;
        settings.AreBrowserAcceleratorKeysEnabled = isDev; // F12 / refresh only in dev
        settings.IsStatusBarEnabled = false;
        settings.IsZoomControlEnabled = false;

        if (isDev)
        {
            core.Navigate(devUrl!);
        }
        else
        {
            var wwwroot = Path.Combine(AppContext.BaseDirectory, "wwwroot");
            core.SetVirtualHostNameToFolderMapping(
                "app", wwwroot, CoreWebView2HostResourceAccessKind.Allow);
            core.Navigate("https://app/index.html");
        }
    }

    // Bridge for the frontend's platform.fetchText: only https op.gg URLs are
    // fetched; the result is posted back as { type, id, ok, status, text }.
    private async void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        int id = 0;
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return;
            if (!root.TryGetProperty("type", out var typeEl) || typeEl.GetString() != "fetch") return;
            id = root.TryGetProperty("id", out var idEl) ? idEl.GetInt32() : 0;
            var url = root.TryGetProperty("url", out var urlEl) ? urlEl.GetString() : null;

            if (string.IsNullOrEmpty(url) || !IsAllowedUrl(url))
            {
                PostFetchResult(id, false, 0, "URL not allowed");
                return;
            }

            using var response = await Http.GetAsync(url);
            var body = await response.Content.ReadAsStringAsync();
            PostFetchResult(id, response.IsSuccessStatusCode, (int)response.StatusCode, body);
        }
        catch (Exception ex)
        {
            PostFetchResult(id, false, 0, ex.Message);
        }
    }

    private static bool IsAllowedUrl(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return false;
        if (uri.Scheme != Uri.UriSchemeHttps) return false;
        var host = uri.Host.ToLowerInvariant();
        return host == "op.gg" || host.EndsWith(".op.gg", StringComparison.Ordinal);
    }

    private void PostFetchResult(int id, bool ok, int status, string text)
    {
        var payload = JsonSerializer.Serialize(new
        {
            type = "fetch-result",
            id,
            ok,
            status,
            text,
        });
        Web.CoreWebView2.PostWebMessageAsJson(payload);
    }

    // --dev            -> http://localhost:5173
    // --dev=<url>      -> <url>
    // (absent)         -> production (virtual host) mode
    private static string? ResolveDevUrl(string[] args)
    {
        foreach (var arg in args)
        {
            if (arg.Equals("--dev", StringComparison.OrdinalIgnoreCase))
                return "http://localhost:5173";
            if (arg.StartsWith("--dev=", StringComparison.OrdinalIgnoreCase))
                return arg["--dev=".Length..];
        }
        return null;
    }
}
