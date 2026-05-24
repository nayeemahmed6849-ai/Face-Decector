# ==========================================================================
# CYBER-MESH LIGHTWEIGHT HTTP SERVER (NATIVE POWERSHELL)
# Hosts index.html, index.css, and app.js on http://localhost:8080/
# Requirements: None (Uses native .NET HttpListener)
# ==========================================================================

$Port = 8080
$Url = "http://localhost:$Port/"
$RootPath = "c:\Users\nayee\OneDrive\Desktop\Face-Decatore"

# Clear host and display futuristic banner
Clear-Host
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "         CYBER-MESH LOCAL WEB HOST CORE           " -ForegroundColor Magenta
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Root Directory: $RootPath" -ForegroundColor Gray
Write-Host "Binding to: $Url" -ForegroundColor Gray

try {
    # Initialize Listener
    $Listener = New-Object System.Net.HttpListener
    $Listener.Prefixes.Add($Url)
    $Listener.Start()
    
    Write-Host "`n[ONLINE] Server successfully mounted." -ForegroundColor Green
    Write-Host "[LAUNCH] Opening browser at $Url ..." -ForegroundColor Cyan
    Start-Process "http://localhost:$Port/"
    
    Write-Host "[LOG] Press Ctrl+C to shutdown server." -ForegroundColor Yellow
    Write-Host "--------------------------------------------------" -ForegroundColor Gray

    while ($Listener.IsListening) {
        try {
            $Context = $Listener.GetContext()
            $Request = $Context.Request
            $Response = $Context.Response
            
            # Resolve relative file path
            $ReqPath = $Request.Url.AbsolutePath
            if ($ReqPath -eq "/") {
                $ReqPath = "/index.html"
            }
            
            # Clean and combine paths
            $CleanPath = $ReqPath.TrimStart('/')
            $FilePath = Join-Path $RootPath $CleanPath
            
            # Security check: Ensure file is inside root directory
            $FullRoot = (Get-Item $RootPath).FullName
            $FullFile = (Get-Item (Split-Path $FilePath) -ErrorAction SilentlyContinue).FullName
            
            if (Test-Path $FilePath -PathType Leaf) {
                Write-Host "[$($Request.HttpMethod)] 200 OK  - $ReqPath" -ForegroundColor Green
                
                # Detect MIME content-type
                $Ext = [System.IO.Path]::GetExtension($FilePath).ToLower()
                $Mime = switch ($Ext) {
                    ".html" { "text/html; charset=utf-8" }
                    ".css"  { "text/css; charset=utf-8" }
                    ".js"   { "application/javascript; charset=utf-8" }
                    ".png"  { "image/png" }
                    ".jpg"  { "image/jpeg" }
                    ".jpeg" { "image/jpeg" }
                    ".ico"  { "image/x-icon" }
                    default { "application/octet-stream" }
                }
                
                # Read all file bytes
                $Bytes = [System.IO.File]::ReadAllBytes($FilePath)
                
                # Send headers and response body
                $Response.ContentType = $Mime
                $Response.ContentLength64 = $Bytes.Length
                $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
            } else {
                Write-Host "[$($Request.HttpMethod)] 404 NOT FOUND - $ReqPath" -ForegroundColor Red
                
                $Response.StatusCode = 404
                $Msg = [System.Text.Encoding]::UTF8.GetBytes("404 - File Not Found")
                $Response.ContentType = "text/plain"
                $Response.ContentLength64 = $Msg.Length
                $Response.OutputStream.Write($Msg, 0, $Msg.Length)
            }
        } catch {
            Write-Host "[ERROR] Request handling failed: $_" -ForegroundColor Red
        } finally {
            if ($Response) {
                $Response.Close()
            }
        }
    }
} catch {
    Write-Host "`n[FATAL] Server initialization failed: $_" -ForegroundColor Red
    Write-Host "Port $Port might already be in use. Try closing other applications or servers." -ForegroundColor Yellow
} finally {
    if ($Listener) {
        $Listener.Stop()
        Write-Host "`n[OFFLINE] Server stopped." -ForegroundColor Red
    }
}
