using System;
using System.IO;
using System.Linq;
using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace LoLDraftTool.Host;

public partial class MainWindow : Window
{
    private const string WebView2DownloadUrl =
        "https://developer.microsoft.com/microsoft-edge/webview2/";

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
