param([string]$AssetDirectory = 'public/models')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$assetRoot = (Resolve-Path -LiteralPath $AssetDirectory).Path
# Run on the selected upstream glTF export, never on the downloaded archive.
# Color atlases retain 1024px; normals and packed masks use 512px.
Get-ChildItem -LiteralPath $assetRoot -Recurse -Filter '*.gltf' -File | ForEach-Object {
    $document = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json
    $modelDirectory = $_.DirectoryName
    foreach ($image in $document.images) {
        $sourcePath = Join-Path $modelDirectory $image.uri
        if (-not (Test-Path -LiteralPath $sourcePath)) { throw "Missing texture: $sourcePath" }
        $isColor = $image.uri -match 'BaseColor|Dark|Brown'
        $targetName = if ($isColor) { [System.IO.Path]::ChangeExtension($image.uri, '.jpg') } else { $image.uri }
        $targetPath = Join-Path $modelDirectory $targetName
        $limit = if ($isColor) { 1024.0 } else { 512.0 }
        $sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
        try {
            $ratio = [Math]::Min(1.0, $limit / [Math]::Max($sourceImage.Width, $sourceImage.Height))
            $bitmap = [System.Drawing.Bitmap]::new([int]($sourceImage.Width * $ratio), [int]($sourceImage.Height * $ratio))
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.DrawImage($sourceImage, 0, 0, $bitmap.Width, $bitmap.Height)
                # Save through a temporary file because GDI+ holds the source open.
                $temporaryPath = $targetPath + '.optimized'
                if ($isColor) {
                    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
                    $parameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
                    $parameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality, [long]92)
                    $bitmap.Save($temporaryPath, $codec, $parameters)
                    $parameters.Dispose()
                } else { $bitmap.Save($temporaryPath, [System.Drawing.Imaging.ImageFormat]::Png) }
            } finally { $graphics.Dispose(); $bitmap.Dispose() }
        } finally { $sourceImage.Dispose() }
        Move-Item -LiteralPath $temporaryPath -Destination $targetPath -Force
        $image.uri = $targetName
        $image.mimeType = if ($isColor) { 'image/jpeg' } else { 'image/png' }
    }
    $document | ConvertTo-Json -Depth 100 -Compress | Set-Content -LiteralPath $_.FullName -Encoding UTF8
}
# Remove unused exports and atlas duplicates only after checking all references.
$used = @{}
Get-ChildItem -LiteralPath $assetRoot -Recurse -Filter '*.gltf' -File | ForEach-Object {
    $document = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json
    $used[$_.FullName] = $true
    foreach ($resource in @($document.images) + @($document.buffers)) { $used[(Join-Path $_.DirectoryName $resource.uri)] = $true }
}
Get-ChildItem -LiteralPath $assetRoot -Recurse -File | Where-Object { $_.Extension -in @('.png','.jpg','.bin') -and -not $used.ContainsKey($_.FullName) } | ForEach-Object { Remove-Item -LiteralPath $_.FullName }
